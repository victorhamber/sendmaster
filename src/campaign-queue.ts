// Fila de campanha: o request só grava destinatários. O worker envia depois.
import { randomUUID } from 'node:crypto';
import { listEligibleContactIds } from './audience.js';
import { normalizeProviderMessageId } from './provider-callback.js';
import { db, updateContactStatus, type SegmentFilters } from './storage.js';

export const MARKETING_SEND_LIMIT = 5;
export const MARKETING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export type CampaignQueueResult = { queued: number; alreadyQueued: number };
export type QueuedDelivery = { id: string; workspaceId: string; campaignId: string; contactId: string };

type DueMessage = QueuedDelivery & { attempts: number };
type ContactRow = { id: string; email: string; status: string };

function dueMessages(now: Date, limit: number): DueMessage[] {
  return db.prepare(`SELECT id, workspace_id AS workspaceId, campaign_id AS campaignId, contact_id AS contactId, attempts
    FROM campaign_messages WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`)
    .all(now.toISOString(), limit) as DueMessage[];
}

function mark(id: string, status: string, now: string, extra: { attempts?: number; nextAttemptAt?: string; lastError?: string; sentAt?: string | null; providerMessageId?: string | null }): void {
  db.prepare(`UPDATE campaign_messages SET status = ?, attempts = COALESCE(?, attempts), next_attempt_at = COALESCE(?, next_attempt_at),
    last_error = COALESCE(?, last_error), sent_at = COALESCE(?, sent_at), provider_message_id = COALESCE(?, provider_message_id), updated_at = ? WHERE id = ?`)
    .run(status, extra.attempts ?? null, extra.nextAttemptAt ?? null, extra.lastError ?? null, extra.sentAt ?? null, extra.providerMessageId ?? null, now, id);
}

export function enqueueCampaign(workspaceId: string, campaignId: string, filters: SegmentFilters | null, sendAt?: Date | null): CampaignQueueResult | null {
  if (!db.prepare('SELECT id FROM campaign_drafts WHERE workspace_id = ? AND id = ?').get(workspaceId, campaignId)) return null;
  const now = new Date().toISOString();
  const start = sendAt && !Number.isNaN(sendAt.getTime()) && sendAt.getTime() > Date.now() ? sendAt.toISOString() : now;
  const insert = db.prepare(`INSERT OR IGNORE INTO campaign_messages
    (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', 0, ?, '', NULL, ?, ?)`);
  let queued = 0;
  let alreadyQueued = 0;
  for (const contactId of listEligibleContactIds(workspaceId, filters ?? undefined)) {
    if (insert.run(randomUUID(), workspaceId, campaignId, contactId, start, now, now).changes) queued += 1;
    else alreadyQueued += 1;
  }
  return { queued, alreadyQueued };
}

export function enqueueCampaignContact(workspaceId: string, campaignId: string, contactId: string): string | null {
  if (!db.prepare('SELECT id FROM campaign_drafts WHERE workspace_id = ? AND id = ?').get(workspaceId, campaignId)) return null;
  const contact = db.prepare('SELECT status FROM contacts WHERE id = ? AND workspace_id = ?').get(contactId, workspaceId) as { status: string } | undefined;
  if (!contact || contact.status !== 'confirmed') return null;
  const now = new Date().toISOString();
  const id = randomUUID();
  const inserted = db.prepare(`INSERT OR IGNORE INTO campaign_messages
    (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'queued', 0, ?, '', NULL, ?, ?)`).run(id, workspaceId, campaignId, contactId, now, now, now);
  if (inserted.changes) return id;
  return (db.prepare('SELECT id FROM campaign_messages WHERE campaign_id = ? AND contact_id = ?').get(campaignId, contactId) as { id: string } | undefined)?.id ?? null;
}

export function enqueueCampaignReview(workspaceId: string, reviewId: string, sendAt?: Date | null): CampaignQueueResult | null {
  const review = db.prepare(`SELECT campaign_id AS campaignId, filters_json AS filtersJson FROM campaign_reviews
    WHERE workspace_id = ? AND id = ?`).get(workspaceId, reviewId) as { campaignId: string; filtersJson: string } | undefined;
  if (!review) return null;
  return enqueueCampaign(workspaceId, review.campaignId, JSON.parse(review.filtersJson) as SegmentFilters | null, sendAt);
}

function frequencyDelay(workspaceId: string, contactId: string, now: Date): string | null {
  const windowStart = new Date(now.getTime() - MARKETING_WINDOW_MS).toISOString();
  const sent = db.prepare(`SELECT sent_at AS sentAt FROM campaign_messages
    WHERE workspace_id = ? AND contact_id = ? AND status = 'sent' AND sent_at >= ? ORDER BY sent_at ASC`)
    .all(workspaceId, contactId, windowStart) as Array<{ sentAt: string }>;
  if (sent.length < MARKETING_SEND_LIMIT) return null;
  return new Date(Math.max(new Date(sent[0].sentAt).getTime() + MARKETING_WINDOW_MS, now.getTime() + 60_000)).toISOString();
}

export async function processCampaignBatch(options: {
  now: Date; limit: number; deliver: (message: QueuedDelivery) => Promise<{ providerMessageId?: string | null } | void>;
}): Promise<void> {
  const nowIso = options.now.toISOString();
  const staleBefore = new Date(options.now.getTime() - 2 * 60 * 1000).toISOString();
  db.prepare(`UPDATE campaign_messages SET status = 'queued', last_error = ?, updated_at = ? WHERE status = 'sending' AND updated_at <= ?`)
    .run('Envio interrompido. Nova tentativa.', nowIso, staleBefore);
  for (const message of dueMessages(options.now, options.limit)) {
    const claimed = db.prepare(`UPDATE campaign_messages SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'queued'`).run(nowIso, message.id);
    if (!claimed.changes) continue;
    const contact = db.prepare(`SELECT id, email, status FROM contacts WHERE id = ? AND workspace_id = ?`)
      .get(message.contactId, message.workspaceId) as ContactRow | undefined;
    if (!contact || contact.status !== 'confirmed') {
      mark(message.id, 'suppressed', nowIso, { lastError: 'Contato inelegível no momento do envio.' });
      continue;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email) || contact.email.length > 254) {
      updateContactStatus(message.workspaceId, contact.id, 'bounced', 'Endereço rejeitado antes do envio da campanha.');
      mark(message.id, 'bounced', nowIso, { lastError: 'Endereço de e-mail inválido.' });
      continue;
    }
    const delayedUntil = frequencyDelay(message.workspaceId, contact.id, options.now);
    if (delayedUntil) {
      mark(message.id, 'queued', nowIso, { nextAttemptAt: delayedUntil, lastError: 'Limite de e-mails de marketing desta semana.' });
      continue;
    }
    try {
      const delivered = await options.deliver(message);
      const providerMessageId = delivered?.providerMessageId ? normalizeProviderMessageId(delivered.providerMessageId) : null;
      mark(message.id, 'sent', new Date().toISOString(), { sentAt: new Date().toISOString(), lastError: '', providerMessageId });
    } catch (error) {
      const attempts = message.attempts + 1;
      const reason = (error instanceof Error ? error.message : 'Falha ao enviar.').slice(0, 300);
      if (attempts >= MAX_ATTEMPTS) mark(message.id, 'failed', new Date().toISOString(), { attempts, lastError: reason });
      else {
        const delayMs = Math.min(60, 2 ** attempts) * 60_000;
        mark(message.id, 'queued', new Date().toISOString(), {
          attempts, lastError: reason, nextAttemptAt: new Date(options.now.getTime() + delayMs).toISOString(),
        });
      }
    }
  }
}
