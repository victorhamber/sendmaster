// Workspace form configuration and local signup capture.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createContact, db, type Contact, type SignupForm } from './storage.js';

type FormInput = Pick<SignupForm, 'name' | 'title' | 'description' | 'buttonLabel' | 'consentText' | 'collectName' | 'doubleOptIn' | 'tagIds'>;
type FormRow = Omit<SignupForm, 'tagIds' | 'collectName' | 'doubleOptIn'> & { collectName: number; doubleOptIn: number };

function withTags(row: FormRow): SignupForm {
  const tagIds = (db.prepare('SELECT tag_id AS id FROM signup_form_tags WHERE form_id = ? ORDER BY tag_id').all(row.id) as Array<{id:string}>).map(tag => tag.id);
  return { ...row, collectName: Boolean(row.collectName), doubleOptIn: Boolean(row.doubleOptIn), tagIds };
}

export function listSignupForms(workspaceId: string): SignupForm[] {
  const rows = db.prepare(`SELECT id, workspace_id AS workspaceId, name, title, description, button_label AS buttonLabel,
    consent_text AS consentText, collect_name AS collectName, double_opt_in AS doubleOptIn, created_at AS createdAt, updated_at AS updatedAt
    FROM signup_forms WHERE workspace_id = ? ORDER BY updated_at DESC`).all(workspaceId) as FormRow[];
  return rows.map(withTags);
}

export function getSignupForm(formId: string): SignupForm | null {
  const row = db.prepare(`SELECT id, workspace_id AS workspaceId, name, title, description, button_label AS buttonLabel,
    consent_text AS consentText, collect_name AS collectName, double_opt_in AS doubleOptIn, created_at AS createdAt, updated_at AS updatedAt
    FROM signup_forms WHERE id = ?`).get(formId) as FormRow | undefined;
  return row ? withTags(row) : null;
}

export function saveSignupForm(workspaceId: string, input: FormInput, formId?: string): SignupForm | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  const tagIds = [...new Set(input.tagIds)];
  if (tagIds.length > 10) throw new Error('Um formulário pode aplicar até 10 tags.');
  const id = formId ?? randomUUID();
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    if (formId && !db.prepare('SELECT id FROM signup_forms WHERE workspace_id = ? AND id = ?').get(workspaceId, formId)) { db.exec('ROLLBACK'); return null; }
    const tags = tagIds.length
      ? db.prepare(`SELECT id FROM workspace_tags WHERE workspace_id = ? AND id IN (${tagIds.map(() => '?').join(',')})`).all(workspaceId, ...tagIds) as Array<{id:string}>
      : [];
    if (tags.length !== tagIds.length) throw new Error('Uma ou mais tags não pertencem a este workspace.');
    if (formId) {
      db.prepare(`UPDATE signup_forms SET name = ?, title = ?, description = ?, button_label = ?, consent_text = ?, collect_name = ?, double_opt_in = ?, updated_at = ? WHERE workspace_id = ? AND id = ?`)
        .run(input.name, input.title, input.description, input.buttonLabel, input.consentText, input.collectName ? 1 : 0, input.doubleOptIn ? 1 : 0, now, workspaceId, id);
      db.prepare('DELETE FROM signup_form_tags WHERE workspace_id = ? AND form_id = ?').run(workspaceId, id);
    } else {
      db.prepare(`INSERT INTO signup_forms (id, workspace_id, name, title, description, button_label, consent_text, collect_name, double_opt_in, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, workspaceId, input.name, input.title, input.description, input.buttonLabel, input.consentText, input.collectName ? 1 : 0, input.doubleOptIn ? 1 : 0, now, now);
    }
    const insert = db.prepare('INSERT INTO signup_form_tags (workspace_id, form_id, tag_id) VALUES (?, ?, ?)');
    for (const tag of tags) insert.run(workspaceId, id, tag.id);
    db.exec('COMMIT');
    return getSignupForm(id);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function deleteSignupForm(workspaceId: string, formId: string): boolean {
  return db.prepare('DELETE FROM signup_forms WHERE workspace_id = ? AND id = ?').run(workspaceId, formId).changes > 0;
}

export function submitSignupForm(formId: string, email: string, name: string): { contact: Contact; doubleOptIn: boolean } | null {
  const form = getSignupForm(formId);
  if (!form) return null;
  if (form.doubleOptIn) {
    const existing = db.prepare(`SELECT c.id, c.workspace_id AS workspaceId, c.email, c.name, c.source, c.status,
      c.consent_at AS consentAt, c.consent_evidence AS consentEvidence, c.created_at AS createdAt, c.updated_at AS updatedAt
      FROM signup_confirmation_tokens t JOIN contacts c ON c.id = t.contact_id
      WHERE t.form_id = ? AND c.workspace_id = ? AND c.email_normalized = ? AND c.status = 'pending'
      ORDER BY t.created_at DESC LIMIT 1`).get(formId, form.workspaceId, email.trim().toLowerCase()) as Contact | undefined;
    if (existing) return { contact: existing, doubleOptIn: true };
  }
  const now = new Date().toISOString();
  const contact = createContact({
    id: randomUUID(), workspaceId: form.workspaceId, email, name,
    source: `Formulário: ${form.name}`.slice(0, 120), status: form.doubleOptIn ? 'pending' : 'confirmed', consentAt: form.doubleOptIn ? null : now,
    consentEvidence: `Checkbox aceito; formulário="${form.name}"; texto="${form.consentText}"; data=${now}`,
  }, form.tagIds);
  return contact ? { contact, doubleOptIn: form.doubleOptIn } : null;
}

export function issueSignupConfirmation(formId: string, contactId: string): { token: string; expiresAt: string } | null {
  const form = getSignupForm(formId);
  if (!form) return null;
  const contact = db.prepare(`SELECT id FROM contacts WHERE id = ? AND workspace_id = ? AND status = 'pending'`).get(contactId, form.workspaceId);
  if (!contact) return null;
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`UPDATE signup_confirmation_tokens SET used_at = ? WHERE contact_id = ? AND used_at IS NULL`).run(createdAt, contactId);
    db.prepare(`INSERT INTO signup_confirmation_tokens (id, workspace_id, contact_id, form_id, token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), form.workspaceId, contactId, formId, createHash('sha256').update(token).digest('hex'), expiresAt, createdAt);
    db.exec('COMMIT');
    return { token, expiresAt };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function confirmSignupToken(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return false;
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const digest = createHash('sha256').update(token).digest('hex');
    const row = db.prepare(`SELECT t.id AS tokenId, t.workspace_id AS workspaceId, t.contact_id AS contactId,
      c.status, c.consent_evidence AS consentEvidence FROM signup_confirmation_tokens t
      JOIN contacts c ON c.id = t.contact_id AND c.workspace_id = t.workspace_id
      WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ?`).get(digest, now) as
      {tokenId:string;workspaceId:string;contactId:string;status:string;consentEvidence:string}|undefined;
    if (!row || row.status !== 'pending') { db.exec('ROLLBACK'); return false; }
    const evidence = `${row.consentEvidence}; confirmação double opt-in=${now}`.slice(0, 2000);
    const changed = db.prepare(`UPDATE contacts SET status = 'confirmed', consent_at = ?, consent_evidence = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ? AND status = 'pending'`).run(now, evidence, now, row.contactId, row.workspaceId);
    if (!changed.changes) { db.exec('ROLLBACK'); return false; }
    db.prepare('UPDATE signup_confirmation_tokens SET used_at = ? WHERE id = ?').run(now, row.tokenId);
    db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(randomUUID(), row.workspaceId, 'contact.status_changed', row.contactId,
        JSON.stringify({ contactId: row.contactId, status: 'confirmed', consentAt: now, updatedAt: now, source: 'double_opt_in' }), now);
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
