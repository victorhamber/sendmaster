// Campaign drafting. Sending is intentionally owned by a later delivery workflow.
import { randomUUID } from 'node:crypto';
import { countEligibleContacts } from './audience.js';
import { db, type CampaignDraft, type CampaignReviewEntry, type SegmentFilters } from './storage.js';

type CampaignRow = Omit<CampaignDraft, 'eligibleCount'> & { html: string; text: string };

function withCount(row: CampaignRow): CampaignDraft {
  const count = db.prepare(`SELECT COUNT(*) AS count FROM contacts WHERE workspace_id = ? AND status = 'confirmed'`).get(row.workspaceId) as {count:number};
  return { ...row, eligibleCount: count.count };
}

export function listCampaignDrafts(workspaceId: string): CampaignDraft[] {
  const rows = db.prepare(`SELECT id, workspace_id AS workspaceId, name, subject, preheader, html_body AS html,
    text_body AS text, created_at AS createdAt, updated_at AS updatedAt FROM campaign_drafts
    WHERE workspace_id = ? ORDER BY updated_at DESC`).all(workspaceId) as CampaignRow[];
  return rows.map(withCount);
}

export function getCampaignDraft(workspaceId: string, id: string): CampaignDraft | null {
  const row = db.prepare(`SELECT id, workspace_id AS workspaceId, name, subject, preheader, html_body AS html,
    text_body AS text, created_at AS createdAt, updated_at AS updatedAt FROM campaign_drafts
    WHERE workspace_id = ? AND id = ?`).get(workspaceId, id) as CampaignRow | undefined;
  return row ? withCount(row) : null;
}

export function saveCampaignDraft(workspaceId: string, input: Pick<CampaignDraft, 'name' | 'subject' | 'preheader' | 'html' | 'text'>, id?: string): CampaignDraft | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  const now = new Date().toISOString();
  const campaignId = id ?? randomUUID();
  if (id) {
    const result = db.prepare(`UPDATE campaign_drafts SET name = ?, subject = ?, preheader = ?, html_body = ?, text_body = ?, updated_at = ?
      WHERE id = ? AND workspace_id = ?`).run(input.name, input.subject, input.preheader, input.html, input.text, now, id, workspaceId);
    if (!result.changes) return null;
  } else {
    db.prepare(`INSERT INTO campaign_drafts (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(campaignId, workspaceId, input.name, input.subject, input.preheader, input.html, input.text, now, now);
  }
  const row = db.prepare(`SELECT id, workspace_id AS workspaceId, name, subject, preheader, html_body AS html,
    text_body AS text, created_at AS createdAt, updated_at AS updatedAt FROM campaign_drafts WHERE id = ? AND workspace_id = ?`)
    .get(campaignId, workspaceId) as CampaignRow;
  return withCount(row);
}

export function deleteCampaignDraft(workspaceId: string, id: string): boolean {
  return db.prepare('DELETE FROM campaign_drafts WHERE workspace_id = ? AND id = ?').run(workspaceId, id).changes > 0;
}

type ReviewRow = Omit<CampaignReviewEntry, 'currentRecipientCount'> & { filtersJson: string };

function withCurrentCount(row: ReviewRow): CampaignReviewEntry {
  const filters = JSON.parse(row.filtersJson) as SegmentFilters | null;
  return { ...row, currentRecipientCount: countEligibleContacts(row.workspaceId, filters ?? undefined) };
}

export function listCampaignReviewEntries(workspaceId: string): CampaignReviewEntry[] {
  const rows = db.prepare(`SELECT r.id, r.workspace_id AS workspaceId, r.campaign_id AS campaignId,
      c.name AS campaignName, r.segment_id AS segmentId, r.segment_name AS segmentName,
      r.recipient_count AS recipientCount, r.filters_json AS filtersJson, r.created_at AS createdAt
    FROM campaign_reviews r JOIN campaign_drafts c ON c.id = r.campaign_id AND c.workspace_id = r.workspace_id
    WHERE r.workspace_id = ? ORDER BY r.created_at DESC`).all(workspaceId) as ReviewRow[];
  return rows.map(withCurrentCount);
}

export function addCampaignReviewEntry(workspaceId: string, campaignId: string, segmentId: string | null): CampaignReviewEntry | null {
  const campaign = getCampaignDraft(workspaceId, campaignId);
  if (!campaign) return null;
  if (!campaign.subject || !campaign.html.trim() || !campaign.text.trim()) throw new Error('Preencha assunto, HTML e versão em texto antes de enviar para revisão.');
  let filters: SegmentFilters | null = null;
  let segmentName = 'Todos os contatos confirmados';
  if (segmentId) {
    const segment = db.prepare(`SELECT name, filters_json AS filtersJson FROM audience_segments WHERE workspace_id = ? AND id = ?`)
      .get(workspaceId, segmentId) as {name:string;filtersJson:string}|undefined;
    if (!segment) throw new Error('O segmento selecionado não existe neste workspace.');
    filters = JSON.parse(segment.filtersJson) as SegmentFilters;
    segmentName = segment.name;
  }
  const recipientCount = countEligibleContacts(workspaceId, filters ?? undefined);
  if (recipientCount < 1) throw new Error('Este público não tem contatos com consentimento confirmado.');
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO campaign_reviews (id, workspace_id, campaign_id, segment_id, segment_name, filters_json, recipient_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, workspaceId, campaignId, segmentId, segmentName, JSON.stringify(filters), recipientCount, createdAt);
  const row = db.prepare(`SELECT r.id, r.workspace_id AS workspaceId, r.campaign_id AS campaignId,
      c.name AS campaignName, r.segment_id AS segmentId, r.segment_name AS segmentName,
      r.recipient_count AS recipientCount, r.filters_json AS filtersJson, r.created_at AS createdAt
    FROM campaign_reviews r JOIN campaign_drafts c ON c.id = r.campaign_id AND c.workspace_id = r.workspace_id
    WHERE r.workspace_id = ? AND r.id = ?`).get(workspaceId, id) as ReviewRow;
  return withCurrentCount(row);
}

export function deleteCampaignReviewEntry(workspaceId: string, id: string): boolean {
  return db.prepare('DELETE FROM campaign_reviews WHERE workspace_id = ? AND id = ?').run(workspaceId, id).changes > 0;
}
