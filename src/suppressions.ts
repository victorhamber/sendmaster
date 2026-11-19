// Durable contact suppression, unsubscribe tokens, and normalized provider-event intake.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, type ContactStatus } from './storage.js';

export type ProviderMailSignal = 'bounce' | 'complaint';
export type ProviderMailEventResult = { duplicate: boolean; matched: boolean; status: ContactStatus | null };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function recordIntegrationEvent(workspaceId: string, eventType: string, aggregateId: string, payload: Record<string, unknown>, now: string): void {
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), workspaceId, eventType, aggregateId, JSON.stringify(payload), now);
}

export function issueUnsubscribeToken(workspaceId: string, contactId: string): string | null {
  if (!db.prepare('SELECT id FROM contacts WHERE id = ? AND workspace_id = ?').get(contactId, workspaceId)) return null;
  const token = randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO contact_unsubscribe_tokens (id, workspace_id, contact_id, token_hash, created_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), workspaceId, contactId, hashToken(token), new Date().toISOString());
  return token;
}

export function createUnsubscribeUrl(workspaceId: string, contactId: string, publicBaseUrl: string): string {
  let base: URL;
  try { base = new URL(publicBaseUrl); } catch { throw new Error('Configure SENDMASTER_PUBLIC_URL com o endereço público HTTPS da aplicação antes de preparar campanhas.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || ['localhost', '127.0.0.1', '::1'].includes(base.hostname)) {
    throw new Error('SENDMASTER_PUBLIC_URL precisa ser um endereço público HTTPS, sem credenciais, parâmetros ou fragmento.');
  }
  const token = issueUnsubscribeToken(workspaceId, contactId);
  if (!token) throw new Error('Contato não encontrado neste workspace.');
  return new URL(`/unsubscribe?token=${encodeURIComponent(token)}`, base).toString();
}

export function unsubscribeWithToken(token: string): boolean {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return false;
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = db.prepare(`SELECT t.id AS tokenId, t.used_at AS usedAt, t.workspace_id AS workspaceId, t.contact_id AS contactId,
      c.status, c.consent_evidence AS consentEvidence FROM contact_unsubscribe_tokens t
      JOIN contacts c ON c.id = t.contact_id AND c.workspace_id = t.workspace_id WHERE t.token_hash = ?`)
      .get(hashToken(token)) as {tokenId:string;usedAt:string|null;workspaceId:string;contactId:string;status:ContactStatus;consentEvidence:string}|undefined;
    if (!row) { db.exec('ROLLBACK'); return false; }
    if (!row.usedAt) {
      const evidence = `${row.consentEvidence}; descadastro por link=${now}`.slice(0, 2000);
      if (row.status !== 'complained' && row.status !== 'unsubscribed') {
        db.prepare(`UPDATE contacts SET status = 'unsubscribed', consent_evidence = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
          .run(evidence, now, row.contactId, row.workspaceId);
      } else {
        db.prepare(`UPDATE contacts SET consent_evidence = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
          .run(evidence, now, row.contactId, row.workspaceId);
      }
      recordIntegrationEvent(row.workspaceId, 'contact.unsubscribed', row.contactId,
        { contactId: row.contactId, status: 'unsubscribed', source: 'one_click_unsubscribe', occurredAt: now }, now);
      db.prepare('UPDATE contact_unsubscribe_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, row.tokenId);
    }
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function applyProviderMailEvent(input: {
  workspaceId: string; provider: string; providerEventId: string; email: string; signal: ProviderMailSignal; payload?: Record<string, unknown>;
}): ProviderMailEventResult | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(input.workspaceId)) return null;
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const duplicate = db.prepare(`SELECT id FROM mail_provider_events WHERE workspace_id = ? AND provider = ? AND provider_event_id = ?`)
      .get(input.workspaceId, input.provider, input.providerEventId);
    if (duplicate) { db.exec('ROLLBACK'); return { duplicate: true, matched: false, status: null }; }
    const contact = db.prepare(`SELECT id, status, consent_evidence AS consentEvidence FROM contacts
      WHERE workspace_id = ? AND email_normalized = ?`).get(input.workspaceId, email) as
      {id:string;status:ContactStatus;consentEvidence:string}|undefined;
    const nextStatus: ContactStatus = input.signal === 'bounce' ? 'bounced' : 'complained';
    const canApply = contact && !['unsubscribed', 'bounced', 'complained'].includes(contact.status);
    const eventId = randomUUID();
    db.prepare(`INSERT INTO mail_provider_events (id, workspace_id, provider, provider_event_id, event_type,
      email_normalized, contact_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(eventId, input.workspaceId, input.provider, input.providerEventId, input.signal, email, contact?.id ?? null,
        JSON.stringify(input.payload ?? {}), now);
    if (contact && canApply) {
      const evidence = `${contact.consentEvidence}; ${input.signal} recebido de ${input.provider}=${now}`.slice(0, 2000);
      db.prepare(`UPDATE contacts SET status = ?, consent_evidence = ?, updated_at = ? WHERE id = ? AND workspace_id = ?`)
        .run(nextStatus, evidence, now, contact.id, input.workspaceId);
    }
    const eventType = contact ? `contact.${input.signal === 'bounce' ? 'bounced' : 'complained'}` : 'mail_event.unmatched';
    const aggregateId = contact?.id ?? createHash('sha256').update(email).digest('hex');
    recordIntegrationEvent(input.workspaceId, eventType, aggregateId, {
      ...(contact ? { contactId: contact.id } : {}), provider: input.provider, providerEventId: input.providerEventId,
      signal: input.signal, status: contact ? (canApply ? nextStatus : contact.status) : 'unmatched', occurredAt: now,
    }, now);
    db.exec('COMMIT');
    return { duplicate: false, matched: Boolean(contact), status: contact ? (canApply ? nextStatus : contact.status) : null };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
