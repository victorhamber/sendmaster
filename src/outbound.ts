// Entrega eventos gravados para um destino HTTPS, com nova tentativa fora do request.
import { createHmac, randomUUID } from 'node:crypto';
import { protectSecret, revealSecret } from './secret-store.js';
import { db } from './storage.js';

const MAX_ATTEMPTS = 5;

export type OutboundDelivery = { id: string; url: string; body: string; signature: string };
type DueRow = { id: string; url: string; secret: string; attempts: number; eventId: string; type: string; aggregateId: string; payloadJson: string; createdAt: string };

function acceptableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false;
    if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false;
    return !/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
  } catch { return false; }
}

export function saveOutboundEndpoint(workspaceId: string, url: string, secret: string): { id: string } | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  if (!acceptableUrl(url) || secret.trim().length < 8) return null;
  const id = randomUUID();
  db.prepare(`INSERT INTO outbound_endpoints (id, workspace_id, url, secret, enabled, created_at) VALUES (?, ?, ?, ?, 1, ?)`)
    .run(id, workspaceId, url, protectSecret(secret.trim()), new Date().toISOString());
  return { id };
}

export function listOutboundEndpoints(workspaceId: string): Array<{ id: string; url: string; createdAt: string }> {
  return db.prepare(`SELECT id, url, created_at AS createdAt FROM outbound_endpoints WHERE workspace_id = ? AND enabled = 1 ORDER BY created_at DESC`).all(workspaceId) as Array<{ id: string; url: string; createdAt: string }>;
}

export function deleteOutboundEndpoint(workspaceId: string, id: string): boolean {
  return db.prepare('DELETE FROM outbound_endpoints WHERE workspace_id = ? AND id = ?').run(workspaceId, id).changes > 0;
}

export function enqueuePendingDeliveries(limit: number): number {
  const now = new Date().toISOString();
  const pending = db.prepare(`SELECT e.id AS endpointId, ev.id AS eventRowId
    FROM outbound_endpoints e JOIN integration_events ev ON ev.workspace_id = e.workspace_id
    WHERE e.enabled = 1 AND NOT EXISTS (SELECT 1 FROM outbound_deliveries d WHERE d.endpoint_id = e.id AND d.event_row_id = ev.id)
    ORDER BY ev.id LIMIT ?`).all(limit) as Array<{ endpointId: string; eventRowId: number }>;
  const insert = db.prepare(`INSERT OR IGNORE INTO outbound_deliveries
    (id, endpoint_id, event_row_id, status, attempts, next_attempt_at, last_error, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', 0, ?, '', ?, ?)`);
  let queued = 0;
  for (const row of pending) if (insert.run(randomUUID(), row.endpointId, row.eventRowId, now, now, now).changes) queued += 1;
  return queued;
}

export async function processOutboundBatch(options: {
  now: Date; limit: number; deliver: (delivery: OutboundDelivery) => Promise<void>;
}): Promise<void> {
  const nowIso = options.now.toISOString();
  const staleBefore = new Date(options.now.getTime() - 2 * 60 * 1000).toISOString();
  db.prepare(`UPDATE outbound_deliveries SET status = 'queued', last_error = ?, updated_at = ? WHERE status = 'sending' AND updated_at <= ?`)
    .run('Entrega interrompida. Nova tentativa.', nowIso, staleBefore);
  const due = db.prepare(`SELECT d.id, e.url, e.secret, d.attempts, ev.event_id AS eventId, ev.event_type AS type,
      ev.aggregate_id AS aggregateId, ev.payload_json AS payloadJson, ev.created_at AS createdAt
    FROM outbound_deliveries d JOIN outbound_endpoints e ON e.id = d.endpoint_id
    JOIN integration_events ev ON ev.id = d.event_row_id
    WHERE d.status = 'queued' AND d.next_attempt_at <= ? ORDER BY d.next_attempt_at LIMIT ?`).all(nowIso, options.limit) as DueRow[];
  for (const row of due) {
    const claimed = db.prepare(`UPDATE outbound_deliveries SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'queued'`).run(nowIso, row.id);
    if (!claimed.changes) continue;
    const body = JSON.stringify({ id: row.eventId, type: row.type, aggregateId: row.aggregateId, payload: JSON.parse(row.payloadJson), createdAt: row.createdAt });
    const signature = createHmac('sha256', revealSecret(row.secret)).update(body).digest('hex');
    try {
      await options.deliver({ id: row.id, url: row.url, body, signature });
      db.prepare(`UPDATE outbound_deliveries SET status = 'delivered', last_error = '', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
    } catch (error) {
      const attempts = row.attempts + 1;
      const reason = (error instanceof Error ? error.message : 'Falha ao entregar.').slice(0, 300);
      if (attempts >= MAX_ATTEMPTS) db.prepare(`UPDATE outbound_deliveries SET status = 'failed', attempts = ?, last_error = ?, updated_at = ? WHERE id = ?`).run(attempts, reason, new Date().toISOString(), row.id);
      else {
        const next = new Date(options.now.getTime() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
        db.prepare(`UPDATE outbound_deliveries SET status = 'queued', attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?`).run(attempts, next, reason, new Date().toISOString(), row.id);
      }
    }
  }
}
