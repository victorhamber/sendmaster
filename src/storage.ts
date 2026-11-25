// Persistência local do SendMaster: workspaces, briefs reutilizáveis e domínios.
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type Workspace = { id: string; name: string; product: string; createdAt: string };
export type Brief = { id: string; name: string; data: Record<string, string>; updatedAt: string };
export type Domains = { sending: string; tracking: string };
export type ContactStatus = 'pending' | 'confirmed' | 'unsubscribed' | 'bounced' | 'complained';
export type Contact = { id: string; workspaceId: string; email: string; name: string; phone: string; source: string; status: ContactStatus; consentAt: string | null; consentEvidence: string; createdAt: string; updatedAt: string };
export type Tag = { id: string; workspaceId: string; name: string; createdAt: string };
export type SegmentFilters = { search: string; status: ContactStatus | ''; source: string; tagId: string };
export type Segment = { id: string; workspaceId: string; name: string; filters: SegmentFilters; createdAt: string; updatedAt: string };
export type SignupForm = { id: string; workspaceId: string; name: string; title: string; description: string; buttonLabel: string; consentText: string; collectName: boolean; collectPhone: boolean; phoneRequired: boolean; doubleOptIn: boolean; pageColor: string; cardColor: string; textColor: string; buttonColor: string; buttonTextColor: string; tagIds: string[]; createdAt: string; updatedAt: string };
export type CampaignDraft = { id: string; workspaceId: string; name: string; subject: string; preheader: string; html: string; text: string; createdAt: string; updatedAt: string; eligibleCount: number };
export type CampaignReviewEntry = { id: string; workspaceId: string; campaignId: string; campaignName: string; segmentId: string | null; segmentName: string; recipientCount: number; currentRecipientCount: number; createdAt: string };
export type IntegrationEvent = { id: number; eventId: string; type: string; aggregateId: string; payload: Record<string, unknown>; createdAt: string };
export type AppState = {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  briefsByWorkspace: Record<string, Brief[]>;
  domainsByWorkspace: Record<string, Domains>;
  legacyImported: boolean;
};

const databasePath = resolve(process.env.SENDMASTER_DB_PATH || 'data/sendmaster.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, product TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS briefs (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL, data_json TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS briefs_workspace_idx ON briefs(workspace_id);
  CREATE TABLE IF NOT EXISTS workspace_domains (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), sending_domain TEXT NOT NULL,
    tracking_domain TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS workspace_mail_settings (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL, settings_json TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL,
    email_normalized TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','confirmed','unsubscribed','bounced','complained')),
    consent_at TEXT, consent_evidence TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(workspace_id, email_normalized)
  );
  CREATE INDEX IF NOT EXISTS contacts_workspace_status_idx ON contacts(workspace_id, status);
  CREATE TABLE IF NOT EXISTS workspace_tags (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, name_normalized TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(workspace_id, name_normalized)
  );
  CREATE INDEX IF NOT EXISTS workspace_tags_workspace_idx ON workspace_tags(workspace_id, name_normalized);
  CREATE TABLE IF NOT EXISTS signup_forms (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, button_label TEXT NOT NULL,
    consent_text TEXT NOT NULL, collect_name INTEGER NOT NULL DEFAULT 0, double_opt_in INTEGER NOT NULL DEFAULT 1,
    collect_phone INTEGER NOT NULL DEFAULT 0, phone_required INTEGER NOT NULL DEFAULT 0,
    page_color TEXT NOT NULL DEFAULT '#f5f8f6', card_color TEXT NOT NULL DEFAULT '#ffffff',
    text_color TEXT NOT NULL DEFAULT '#20352c', button_color TEXT NOT NULL DEFAULT '#176b50', button_text_color TEXT NOT NULL DEFAULT '#ffffff',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS signup_forms_workspace_idx ON signup_forms(workspace_id, updated_at);
  CREATE TABLE IF NOT EXISTS signup_form_tags (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    form_id TEXT NOT NULL REFERENCES signup_forms(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES workspace_tags(id) ON DELETE CASCADE,
    PRIMARY KEY(form_id, tag_id)
  );
  CREATE TABLE IF NOT EXISTS signup_confirmation_tokens (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    form_id TEXT NOT NULL REFERENCES signup_forms(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS signup_confirmation_contact_idx ON signup_confirmation_tokens(contact_id, created_at);
  CREATE TABLE IF NOT EXISTS campaign_drafts (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, subject TEXT NOT NULL, preheader TEXT NOT NULL DEFAULT '', html_body TEXT NOT NULL DEFAULT '',
    text_body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS campaign_drafts_workspace_idx ON campaign_drafts(workspace_id, updated_at);
  CREATE TABLE IF NOT EXISTS email_templates (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, subject TEXT NOT NULL, preheader TEXT NOT NULL DEFAULT '', html_body TEXT NOT NULL DEFAULT '',
    text_body TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_templates_workspace_idx ON email_templates(workspace_id, updated_at);
  CREATE TABLE IF NOT EXISTS campaign_reviews (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES campaign_drafts(id) ON DELETE CASCADE,
    segment_id TEXT, segment_name TEXT NOT NULL, filters_json TEXT NOT NULL,
    recipient_count INTEGER NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS campaign_reviews_workspace_idx ON campaign_reviews(workspace_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS contact_unsubscribe_tokens (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, used_at TEXT
  );
  CREATE INDEX IF NOT EXISTS unsubscribe_tokens_contact_idx ON contact_unsubscribe_tokens(contact_id, created_at);
  CREATE TABLE IF NOT EXISTS mail_provider_events (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, provider_event_id TEXT NOT NULL, event_type TEXT NOT NULL,
    email_normalized TEXT NOT NULL, contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
    payload_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id, provider, provider_event_id)
  );
  CREATE INDEX IF NOT EXISTS mail_provider_events_contact_idx ON mail_provider_events(workspace_id, contact_id, created_at);
  CREATE TABLE IF NOT EXISTS contact_tags (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES workspace_tags(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL, PRIMARY KEY(contact_id, tag_id)
  );
  CREATE INDEX IF NOT EXISTS contact_tags_workspace_tag_idx ON contact_tags(workspace_id, tag_id, contact_id);
  CREATE TABLE IF NOT EXISTS audience_segments (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, name_normalized TEXT NOT NULL, filters_json TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, name_normalized)
  );
  CREATE INDEX IF NOT EXISTS audience_segments_workspace_idx ON audience_segments(workspace_id, updated_at);
  CREATE TABLE IF NOT EXISTS contact_external_ids (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), system TEXT NOT NULL, external_id TEXT NOT NULL,
    contact_id TEXT NOT NULL REFERENCES contacts(id), created_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id, system, external_id)
  );
  CREATE TABLE IF NOT EXISTS integration_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id), event_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS integration_events_workspace_idx ON integration_events(workspace_id, id);
  CREATE TABLE IF NOT EXISTS outbound_endpoints (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    url TEXT NOT NULL, secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS outbound_endpoints_workspace_idx ON outbound_endpoints(workspace_id, created_at);
  CREATE TABLE IF NOT EXISTS outbound_deliveries (
    id TEXT PRIMARY KEY, endpoint_id TEXT NOT NULL REFERENCES outbound_endpoints(id) ON DELETE CASCADE,
    event_row_id INTEGER NOT NULL REFERENCES integration_events(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('queued','sending','delivered','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(endpoint_id, event_row_id)
  );
  CREATE INDEX IF NOT EXISTS outbound_deliveries_due_idx ON outbound_deliveries(status, next_attempt_at);
  CREATE TABLE IF NOT EXISTS campaign_messages (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES campaign_drafts(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('queued','sending','sent','failed','suppressed','bounced')),
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '',
    sent_at TEXT, provider_message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(campaign_id, contact_id)
  );
  CREATE INDEX IF NOT EXISTS campaign_messages_due_idx ON campaign_messages(status, next_attempt_at);
  CREATE INDEX IF NOT EXISTS campaign_messages_provider_message_idx ON campaign_messages(workspace_id, provider_message_id);
  CREATE TABLE IF NOT EXISTS message_clicks (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES campaign_messages(id) ON DELETE CASCADE,
    url TEXT NOT NULL, clicks INTEGER NOT NULL DEFAULT 0, first_clicked_at TEXT NOT NULL,
    UNIQUE(message_id, url)
  );
  CREATE TABLE IF NOT EXISTS message_track_tokens (
    id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES campaign_messages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('open','click')), token_hash TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sequences (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL, steps_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sequences_workspace_idx ON sequences(workspace_id, updated_at);
  CREATE TABLE IF NOT EXISTS sequence_enrollments (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sequence_id TEXT NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
    contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    step_index INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL CHECK(status IN ('active','done','stopped')),
    next_at TEXT NOT NULL, last_message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE(sequence_id, contact_id)
  );
  CREATE INDEX IF NOT EXISTS sequence_enrollments_due_idx ON sequence_enrollments(status, next_at);
`);
const signupFormColumns = db.prepare('PRAGMA table_info(signup_forms)').all() as Array<{name:string}>;
if (!signupFormColumns.some(column => column.name === 'double_opt_in')) {
  db.exec('ALTER TABLE signup_forms ADD COLUMN double_opt_in INTEGER NOT NULL DEFAULT 1');
}
const contactColumns = db.prepare('PRAGMA table_info(contacts)').all() as Array<{name:string}>;
if (!contactColumns.some(column => column.name === 'phone')) db.exec("ALTER TABLE contacts ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
const messageColumns = db.prepare('PRAGMA table_info(campaign_messages)').all() as Array<{name:string}>;
if (!messageColumns.some(column => column.name === 'provider_message_id')) db.exec('ALTER TABLE campaign_messages ADD COLUMN provider_message_id TEXT');
if (!messageColumns.some(column => column.name === 'opened_at')) db.exec('ALTER TABLE campaign_messages ADD COLUMN opened_at TEXT');
if (!messageColumns.some(column => column.name === 'open_count')) db.exec('ALTER TABLE campaign_messages ADD COLUMN open_count INTEGER NOT NULL DEFAULT 0');
for (const [column, definition] of [
  ['collect_phone', "INTEGER NOT NULL DEFAULT 0"], ['phone_required', "INTEGER NOT NULL DEFAULT 0"],
  ['page_color', "TEXT NOT NULL DEFAULT '#f5f8f6'"], ['card_color', "TEXT NOT NULL DEFAULT '#ffffff'"],
  ['text_color', "TEXT NOT NULL DEFAULT '#20352c'"], ['button_color', "TEXT NOT NULL DEFAULT '#176b50'"],
  ['button_text_color', "TEXT NOT NULL DEFAULT '#ffffff'"],
] as const) {
  const columns = db.prepare('PRAGMA table_info(signup_forms)').all() as Array<{name:string}>;
  if (!columns.some(existing => existing.name === column)) db.exec(`ALTER TABLE signup_forms ADD COLUMN ${column} ${definition}`);
}
db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, product, created_at) VALUES (?, ?, ?, ?)`)
  .run('default', 'Meu workspace', '', new Date().toISOString());
db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('active_workspace_id', 'default')`).run();

export function readState(): AppState {
  const workspaces = db.prepare('SELECT id, name, product, created_at AS createdAt FROM workspaces ORDER BY created_at')
    .all() as Workspace[];
  const active = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('active_workspace_id') as { value: string } | undefined;
  const briefsByWorkspace: Record<string, Brief[]> = {};
  for (const row of db.prepare('SELECT id, workspace_id, name, data_json, updated_at FROM briefs ORDER BY updated_at DESC').all() as Array<{id:string;workspace_id:string;name:string;data_json:string;updated_at:string}>) {
    (briefsByWorkspace[row.workspace_id] ??= []).push({ id: row.id, name: row.name, data: JSON.parse(row.data_json), updatedAt: row.updated_at });
  }
  const domainsByWorkspace: Record<string, Domains> = {};
  for (const row of db.prepare('SELECT workspace_id, sending_domain, tracking_domain FROM workspace_domains').all() as Array<{workspace_id:string;sending_domain:string;tracking_domain:string}>) {
    domainsByWorkspace[row.workspace_id] = { sending: row.sending_domain, tracking: row.tracking_domain };
  }
  const imported = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('legacy_imported') as {value:string}|undefined;
  return { workspaces, activeWorkspaceId: active?.value ?? 'default', briefsByWorkspace, domainsByWorkspace, legacyImported: imported?.value === 'true' };
}

export function importLegacy(payload: Partial<AppState>): void {
  const alreadyImported = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('legacy_imported') as {value:string}|undefined;
  if (alreadyImported?.value === 'true') return;
  const insertWorkspace = db.prepare('INSERT OR IGNORE INTO workspaces (id, name, product, created_at) VALUES (?, ?, ?, ?)');
  const insertBrief = db.prepare('INSERT OR IGNORE INTO briefs (id, workspace_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)');
  const upsertDomain = db.prepare(`INSERT INTO workspace_domains (workspace_id, sending_domain, tracking_domain, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET sending_domain=excluded.sending_domain, tracking_domain=excluded.tracking_domain, updated_at=excluded.updated_at`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const workspace of payload.workspaces ?? []) insertWorkspace.run(workspace.id, workspace.name, workspace.product ?? '', workspace.createdAt ?? new Date().toISOString());
    for (const [workspaceId, briefs] of Object.entries(payload.briefsByWorkspace ?? {})) {
      for (const brief of briefs) insertBrief.run(brief.id, workspaceId, brief.name, JSON.stringify(brief.data), brief.updatedAt ?? new Date().toISOString());
    }
    for (const [workspaceId, domains] of Object.entries(payload.domainsByWorkspace ?? {})) {
      upsertDomain.run(workspaceId, domains.sending, domains.tracking, new Date().toISOString());
    }
    const activeId = payload.activeWorkspaceId && (payload.workspaces ?? []).some(w => w.id === payload.activeWorkspaceId) ? payload.activeWorkspaceId : 'default';
    db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(activeId, 'active_workspace_id');
    db.prepare(`INSERT INTO app_settings (key, value) VALUES ('legacy_imported', 'true') ON CONFLICT(key) DO UPDATE SET value='true'`).run();
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function createWorkspace(workspace: Workspace): void {
  db.prepare('INSERT INTO workspaces (id, name, product, created_at) VALUES (?, ?, ?, ?)')
    .run(workspace.id, workspace.name, workspace.product, workspace.createdAt);
}

export function setActiveWorkspace(workspaceId: string): boolean {
  const exists = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId);
  if (!exists) return false;
  db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run(workspaceId, 'active_workspace_id');
  return true;
}

export function saveBrief(workspaceId: string, brief: Brief): boolean {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return false;
  db.prepare(`INSERT INTO briefs (id, workspace_id, name, data_json, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, data_json=excluded.data_json, updated_at=excluded.updated_at`)
    .run(brief.id, workspaceId, brief.name, JSON.stringify(brief.data), brief.updatedAt);
  return true;
}

export function saveDomains(workspaceId: string, domains: Domains): boolean {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return false;
  db.prepare(`INSERT INTO workspace_domains (workspace_id, sending_domain, tracking_domain, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(workspace_id) DO UPDATE SET sending_domain=excluded.sending_domain, tracking_domain=excluded.tracking_domain, updated_at=excluded.updated_at`)
    .run(workspaceId, domains.sending, domains.tracking, new Date().toISOString());
  return true;
}

function recordIntegrationEvent(workspaceId: string, type: string, aggregateId: string, payload: Record<string, unknown>): void {
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), workspaceId, type, aggregateId, JSON.stringify(payload), new Date().toISOString());
}

export function createContact(input: Omit<Contact, 'createdAt' | 'updatedAt'>, tagIds: string[] = []): Contact | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(input.workspaceId)) return null;
  const uniqueTagIds = [...new Set(tagIds)];
  if (uniqueTagIds.length > 10) throw new Error('Um cadastro pode aplicar até 10 tags.');
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const tags = uniqueTagIds.length
      ? db.prepare(`SELECT id, name FROM workspace_tags WHERE workspace_id = ? AND id IN (${uniqueTagIds.map(() => '?').join(',')})`).all(input.workspaceId, ...uniqueTagIds) as Array<{id:string;name:string}>
      : [];
    if (tags.length !== uniqueTagIds.length) throw new Error('Uma ou mais tags não pertencem a este workspace.');
    db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, phone, source, status, consent_at, consent_evidence, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.id, input.workspaceId, input.email, input.email.toLowerCase(), input.name, input.phone, input.source, input.status, input.consentAt, input.consentEvidence, now, now);
    const insertTag = db.prepare('INSERT INTO contact_tags (workspace_id, contact_id, tag_id, created_at) VALUES (?, ?, ?, ?)');
    for (const tag of tags) insertTag.run(input.workspaceId, input.id, tag.id, now);
    const contact = { ...input, createdAt: now, updatedAt: now };
    recordIntegrationEvent(input.workspaceId, 'contact.created', input.id, { ...contact, tags: tags.map(({id,name}) => ({id,name})) });
    db.exec('COMMIT');
    return contact;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function importContacts(workspaceId: string, rows: Array<{ email: string; name: string; source: string }>): { imported: number; duplicates: number } | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  const now = new Date().toISOString();
  const seen = new Set<string>();
  let imported = 0;
  let duplicates = 0;
  const exists = db.prepare('SELECT 1 FROM contacts WHERE workspace_id = ? AND email_normalized = ?');
  const insert = db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, source, status, consent_at, consent_evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, '', ?, ?)`);
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of rows) {
      const normalized = row.email.trim().toLowerCase();
      if (seen.has(normalized) || exists.get(workspaceId, normalized)) { duplicates++; continue; }
      seen.add(normalized);
      const id = randomUUID();
      const contact: Contact = { id, workspaceId, email: row.email.trim(), name: row.name, phone: '', source: row.source || 'importação CSV', status: 'pending', consentAt: null, consentEvidence: '', createdAt: now, updatedAt: now };
      insert.run(id, workspaceId, contact.email, normalized, contact.name, contact.source, now, now);
      recordIntegrationEvent(workspaceId, 'contact.created', id, contact as unknown as Record<string, unknown>);
      imported++;
    }
    db.exec('COMMIT');
    return { imported, duplicates };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function updateContactStatus(workspaceId: string, contactId: string, status: ContactStatus, evidence = ''): Contact | null {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT status FROM contacts WHERE workspace_id = ? AND id = ?').get(workspaceId, contactId) as {status:ContactStatus}|undefined;
    if (!current) { db.exec('ROLLBACK'); return null; }
    if (status === 'confirmed' && ['unsubscribed', 'bounced', 'complained'].includes(current.status)) {
      throw new Error('Este contato está suprimido. Registre um novo consentimento explícito antes de reativá-lo.');
    }
    const changed = db.prepare(`UPDATE contacts SET status = ?,
      consent_at = CASE WHEN ? = 'confirmed' THEN ? ELSE consent_at END,
      consent_evidence = CASE WHEN ? = 'confirmed' THEN ? ELSE consent_evidence END,
      updated_at = ? WHERE workspace_id = ? AND id = ?`)
      .run(status, status, now, status, evidence, now, workspaceId, contactId);
    if (!changed.changes) { db.exec('ROLLBACK'); return null; }
    const contact = db.prepare(`SELECT id, workspace_id AS workspaceId, email, name, phone, source, status, consent_at AS consentAt,
      consent_evidence AS consentEvidence, created_at AS createdAt, updated_at AS updatedAt FROM contacts WHERE id = ?`).get(contactId) as Contact;
    recordIntegrationEvent(workspaceId, 'contact.status_changed', contactId, { contactId, status, consentAt: contact.consentAt, updatedAt: now });
    db.exec('COMMIT');
    return contact;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function recordContactResubscription(workspaceId: string, contactId: string, evidence: string): Contact | null {
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare(`SELECT status FROM contacts WHERE workspace_id = ? AND id = ?`).get(workspaceId, contactId) as {status:ContactStatus}|undefined;
    if (!current || !['unsubscribed', 'bounced', 'complained'].includes(current.status)) { db.exec('ROLLBACK'); return null; }
    const changed = db.prepare(`UPDATE contacts SET status = 'confirmed', consent_at = ?, consent_evidence = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ?`).run(now, evidence, now, workspaceId, contactId);
    if (!changed.changes) { db.exec('ROLLBACK'); return null; }
    const contact = db.prepare(`SELECT id, workspace_id AS workspaceId, email, name, phone, source, status, consent_at AS consentAt,
      consent_evidence AS consentEvidence, created_at AS createdAt, updated_at AS updatedAt FROM contacts WHERE id = ?`).get(contactId) as Contact;
    recordIntegrationEvent(workspaceId, 'contact.resubscribed', contactId, { contactId, status: 'confirmed', consentAt: now, updatedAt: now, source: 'new_explicit_consent' });
    db.exec('COMMIT');
    return contact;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function linkContactExternalId(workspaceId: string, contactId: string, system: string, externalId: string): boolean {
  if (!db.prepare('SELECT id FROM contacts WHERE id = ? AND workspace_id = ?').get(contactId, workspaceId)) return false;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO contact_external_ids (workspace_id, system, external_id, contact_id, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(workspace_id, system, external_id) DO UPDATE SET contact_id=excluded.contact_id`)
      .run(workspaceId, system, externalId, contactId, new Date().toISOString());
    recordIntegrationEvent(workspaceId, 'contact.external_id_linked', contactId, { contactId, system, externalId });
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function listIntegrationEvents(workspaceId: string, afterId: number): IntegrationEvent[] {
  return (db.prepare(`SELECT id, event_id AS eventId, event_type AS type, aggregate_id AS aggregateId, payload_json, created_at AS createdAt
    FROM integration_events WHERE workspace_id = ? AND id > ? ORDER BY id LIMIT 100`).all(workspaceId, afterId) as Array<Omit<IntegrationEvent, 'payload'> & {payload_json:string}>)
    .map(event => ({ id: event.id, eventId: event.eventId, type: event.type, aggregateId: event.aggregateId, payload: JSON.parse(event.payload_json), createdAt: event.createdAt }));
}
