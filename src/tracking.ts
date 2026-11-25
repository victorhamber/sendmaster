// Abertura e clique ligados à mensagem enviada. O destino do clique fica no banco, não na query.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from './storage.js';

export type CampaignReportRow = { campaignId: string; name: string; sent: number; opened: number; clicked: number };
export const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function issueToken(messageId: string, kind: 'open' | 'click', url = ''): string {
  const token = randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO message_track_tokens (id, message_id, kind, token_hash, url, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), messageId, kind, hashToken(token), url, new Date().toISOString());
  return token;
}

function safeHttps(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && url.length <= 2000;
  } catch { return false; }
}

function ownPath(url: string, base: URL): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === base.origin && ['/unsubscribe', '/mail/open', '/mail/click'].includes(parsed.pathname);
  } catch { return false; }
}

export function trackMessage(messageId: string, html: string, text: string, publicBaseUrl: string): { html: string; text: string } {
  const base = new URL(publicBaseUrl);
  const openToken = issueToken(messageId, 'open');
  const pixel = `<img src="${new URL(`/mail/open?token=${encodeURIComponent(openToken)}`, base).toString()}" width="1" height="1" alt="" style="display:none">`;
  const rewrite = (url: string): string => {
    if (!safeHttps(url) || ownPath(url, base)) return url;
    return new URL(`/mail/click?token=${encodeURIComponent(issueToken(messageId, 'click', url))}`, base).toString();
  };
  const nextHtml = html.replace(/href=(["'])(https:\/\/[^"'>\s]+)\1/gi, (match, quote: string, url: string) => {
    const next = rewrite(url);
    return next === url ? match : `href=${quote}${next}${quote}`;
  });
  return { html: `${nextHtml}${pixel}`, text: text.replace(/https:\/\/[^\s<>]+/g, url => rewrite(url)) };
}

function tokenRow(token: string): { messageId: string; kind: string; url: string } | undefined {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return undefined;
  return db.prepare(`SELECT message_id AS messageId, kind, url FROM message_track_tokens WHERE token_hash = ?`)
    .get(hashToken(token)) as { messageId: string; kind: string; url: string } | undefined;
}

export function recordOpen(token: string): boolean {
  const row = tokenRow(token);
  if (!row || row.kind !== 'open') return false;
  const now = new Date().toISOString();
  return db.prepare(`UPDATE campaign_messages SET open_count = open_count + 1, opened_at = COALESCE(opened_at, ?), updated_at = ?
    WHERE id = ? AND status IN ('sending', 'sent')`).run(now, now, row.messageId).changes > 0;
}

export function recordClick(token: string): string | null {
  const row = tokenRow(token);
  if (!row || row.kind !== 'click' || !safeHttps(row.url)) return null;
  if (!db.prepare(`SELECT id FROM campaign_messages WHERE id = ? AND status IN ('sending', 'sent')`).get(row.messageId)) return null;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO message_clicks (id, message_id, url, clicks, first_clicked_at) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(message_id, url) DO UPDATE SET clicks = clicks + 1`).run(randomUUID(), row.messageId, row.url, now);
  return row.url;
}

export function campaignReport(workspaceId: string): CampaignReportRow[] {
  const rows = db.prepare(`SELECT d.id AS campaignId, d.name,
    (SELECT COUNT(*) FROM campaign_messages m WHERE m.campaign_id = d.id AND m.workspace_id = d.workspace_id AND m.status = 'sent') AS sent,
    (SELECT COUNT(*) FROM campaign_messages m WHERE m.campaign_id = d.id AND m.workspace_id = d.workspace_id AND m.status = 'sent' AND COALESCE(m.open_count, 0) > 0) AS opened,
    (SELECT COUNT(DISTINCT c.message_id) FROM message_clicks c JOIN campaign_messages m ON m.id = c.message_id
      WHERE m.campaign_id = d.id AND m.workspace_id = d.workspace_id AND m.status = 'sent') AS clicked
    FROM campaign_drafts d WHERE d.workspace_id = ? ORDER BY d.updated_at DESC`).all(workspaceId) as CampaignReportRow[];
  return rows.map(row => ({ campaignId: row.campaignId, name: row.name, sent: Number(row.sent), opened: Number(row.opened), clicked: Number(row.clicked) }));
}

export type WorkspaceOverview = {
  confirmed: number; sent: number; opened: number; bounced: number;
  next: { name: string; at: string } | null;
  campaigns: CampaignReportRow[];
};

export function workspaceOverview(workspaceId: string): WorkspaceOverview {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM contacts WHERE workspace_id = ? AND status = 'confirmed') AS confirmed,
    (SELECT COUNT(*) FROM campaign_messages WHERE workspace_id = ? AND status = 'sent') AS sent,
    (SELECT COUNT(*) FROM campaign_messages WHERE workspace_id = ? AND status = 'sent' AND COALESCE(open_count, 0) > 0) AS opened,
    (SELECT COUNT(*) FROM campaign_messages WHERE workspace_id = ? AND status = 'bounced') AS bounced`).get(workspaceId, workspaceId, workspaceId, workspaceId) as Omit<WorkspaceOverview, 'next' | 'campaigns'>;
  const next = db.prepare(`SELECT d.name AS name, m.next_attempt_at AS at FROM campaign_messages m
    JOIN campaign_drafts d ON d.id = m.campaign_id
    WHERE m.workspace_id = ? AND m.status = 'queued' ORDER BY m.next_attempt_at LIMIT 1`).get(workspaceId) as { name: string; at: string } | undefined;
  return {
    confirmed: Number(counts.confirmed), sent: Number(counts.sent), opened: Number(counts.opened), bounced: Number(counts.bounced),
    next: next ?? null, campaigns: campaignReport(workspaceId).slice(0, 8),
  };
}

export function reportCsv(rows: CampaignReportRow[]): string {
  return ['campanha,enviados,aberturas,cliques', ...rows.map(row => `${row.name.replaceAll(',', ' ')},${row.sent},${row.opened},${row.clicked}`)].join('\n');
}
