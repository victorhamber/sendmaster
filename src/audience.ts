// Audience queries, workspace tags, contact assignments, and saved segments.
import { randomUUID } from 'node:crypto';
import { db, type Contact, type ContactStatus, type Segment, type SegmentFilters, type Tag } from './storage.js';

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function recordEvent(workspaceId: string, type: string, aggregateId: string, payload: Record<string, unknown>): void {
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(randomUUID(), workspaceId, type, aggregateId, JSON.stringify(payload), new Date().toISOString());
}

export function listTags(workspaceId: string): Tag[] {
  return db.prepare(`SELECT id, workspace_id AS workspaceId, name, created_at AS createdAt
    FROM workspace_tags WHERE workspace_id = ? ORDER BY name_normalized`).all(workspaceId) as Tag[];
}

export function listContactSources(workspaceId: string): string[] {
  return (db.prepare(`SELECT DISTINCT source FROM contacts WHERE workspace_id = ? AND source <> '' ORDER BY source`).all(workspaceId) as Array<{ source: string }>).map(row => row.source);
}

export function createTag(workspaceId: string, name: string): Tag | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  const tag: Tag = { id: randomUUID(), workspaceId, name: name.trim(), createdAt: new Date().toISOString() };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO workspace_tags (id, workspace_id, name, name_normalized, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(tag.id, workspaceId, tag.name, normalized(tag.name), tag.createdAt);
    recordEvent(workspaceId, 'tag.created', tag.id, tag as unknown as Record<string, unknown>);
    db.exec('COMMIT'); return tag;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function deleteTag(workspaceId: string, tagId: string): boolean {
  db.exec('BEGIN IMMEDIATE');
  try {
    const tag = db.prepare(`SELECT id, name FROM workspace_tags WHERE workspace_id = ? AND id = ?`).get(workspaceId, tagId) as { id: string; name: string } | undefined;
    if (!tag) { db.exec('ROLLBACK'); return false; }
    db.prepare('DELETE FROM workspace_tags WHERE workspace_id = ? AND id = ?').run(workspaceId, tagId);
    recordEvent(workspaceId, 'tag.deleted', tagId, { tagId, name: tag.name });
    db.exec('COMMIT'); return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function setContactTags(workspaceId: string, contactId: string, tagIds: string[]): Tag[] | null {
  const uniqueIds = [...new Set(tagIds)];
  if (uniqueIds.length > 100) throw new Error('Um contato pode ter até 100 tags.');
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT id FROM contacts WHERE workspace_id = ? AND id = ?').get(workspaceId, contactId)) { db.exec('ROLLBACK'); return null; }
    const tags = uniqueIds.length
      ? db.prepare(`SELECT id, workspace_id AS workspaceId, name, created_at AS createdAt FROM workspace_tags
          WHERE workspace_id = ? AND id IN (${uniqueIds.map(() => '?').join(',')}) ORDER BY name_normalized`).all(workspaceId, ...uniqueIds) as Tag[]
      : [];
    if (tags.length !== uniqueIds.length) throw new Error('Uma ou mais tags não pertencem a este workspace.');
    db.prepare('DELETE FROM contact_tags WHERE workspace_id = ? AND contact_id = ?').run(workspaceId, contactId);
    const insert = db.prepare('INSERT INTO contact_tags (workspace_id, contact_id, tag_id, created_at) VALUES (?, ?, ?, ?)');
    const now = new Date().toISOString();
    for (const tag of tags) insert.run(workspaceId, contactId, tag.id, now);
    recordEvent(workspaceId, 'contact.tags_changed', contactId, { contactId, tags: tags.map(({ id, name }) => ({ id, name })) });
    db.exec('COMMIT'); return tags;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function listContacts(workspaceId: string, filters: SegmentFilters): Contact[] {
  const query = `%${filters.search.trim().toLowerCase()}%`;
  const contacts = db.prepare(`SELECT c.id, c.workspace_id AS workspaceId, c.email, c.name, c.phone, c.source, c.status,
      c.consent_at AS consentAt, c.consent_evidence AS consentEvidence, c.created_at AS createdAt, c.updated_at AS updatedAt
    FROM contacts c WHERE c.workspace_id = ? AND (? = '%%' OR c.email_normalized LIKE ? OR lower(c.name) LIKE ? OR c.phone LIKE ?)
      AND (? = '' OR c.status = ?) AND (? = '' OR c.source = ?)
      AND (? = '' OR EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.workspace_id = c.workspace_id AND ct.contact_id = c.id AND ct.tag_id = ?))
    ORDER BY c.created_at DESC LIMIT 500`).all(workspaceId, query, query, query, query, filters.status, filters.status,
      filters.source, filters.source, filters.tagId, filters.tagId) as Contact[];
  if (!contacts.length) return contacts;
  const ids = contacts.map(contact => contact.id);
  const rows = db.prepare(`SELECT ct.contact_id AS contactId, t.id, t.name FROM contact_tags ct
    JOIN workspace_tags t ON t.id = ct.tag_id WHERE ct.workspace_id = ? AND ct.contact_id IN (${ids.map(() => '?').join(',')})
    ORDER BY t.name_normalized`).all(workspaceId, ...ids) as Array<{ contactId: string; id: string; name: string }>;
  const byContact = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) (byContact.get(row.contactId) ?? (byContact.set(row.contactId, []), byContact.get(row.contactId)!)).push({ id: row.id, name: row.name });
  return contacts.map(contact => Object.assign(contact, { tags: byContact.get(contact.id) ?? [] }));
}

function confirmedAudience(workspaceId: string, filters?: SegmentFilters): { sql: string; params: string[] } | null {
  const search = filters?.search.trim().toLowerCase() ?? '';
  const status = filters?.status ?? '';
  if (status && status !== 'confirmed') return null;
  const source = filters?.source ?? '';
  const tagId = filters?.tagId ?? '';
  const query = `%${search}%`;
  return {
    sql: `c.workspace_id = ? AND c.status = 'confirmed'
      AND (? = '' OR c.email_normalized LIKE ? OR lower(c.name) LIKE ?)
      AND (? = '' OR c.source = ?) AND (? = '' OR EXISTS (
        SELECT 1 FROM contact_tags ct WHERE ct.workspace_id = c.workspace_id AND ct.contact_id = c.id AND ct.tag_id = ?
      ))`,
    params: [workspaceId, search, query, query, source, source, tagId, tagId],
  };
}

export function countEligibleContacts(workspaceId: string, filters?: SegmentFilters): number {
  const audience = confirmedAudience(workspaceId, filters);
  if (!audience) return 0;
  const result = db.prepare(`SELECT COUNT(*) AS count FROM contacts c WHERE ${audience.sql}`).get(...audience.params) as {count:number};
  return result.count;
}

export function listEligibleContactIds(workspaceId: string, filters?: SegmentFilters): string[] {
  const audience = confirmedAudience(workspaceId, filters);
  if (!audience) return [];
  return (db.prepare(`SELECT c.id FROM contacts c WHERE ${audience.sql} ORDER BY c.created_at`).all(...audience.params) as Array<{id:string}>).map(row => row.id);
}

export function listSegments(workspaceId: string): Segment[] {
  const rows = db.prepare(`SELECT id, workspace_id AS workspaceId, name, filters_json AS filtersJson,
    created_at AS createdAt, updated_at AS updatedAt FROM audience_segments WHERE workspace_id = ? ORDER BY updated_at DESC`).all(workspaceId) as Array<Omit<Segment, 'filters'> & { filtersJson: string }>;
  return rows.map(({ filtersJson, ...segment }) => ({ ...segment, filters: JSON.parse(filtersJson) as SegmentFilters }));
}

export function createSegment(workspaceId: string, name: string, filters: SegmentFilters): Segment | null {
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId)) return null;
  const now = new Date().toISOString();
  const segment: Segment = { id: randomUUID(), workspaceId, name: name.trim(), filters, createdAt: now, updatedAt: now };
  db.prepare(`INSERT INTO audience_segments (id, workspace_id, name, name_normalized, filters_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(segment.id, workspaceId, segment.name, normalized(segment.name), JSON.stringify(filters), now, now);
  return segment;
}

export function deleteSegment(workspaceId: string, segmentId: string): boolean {
  return db.prepare('DELETE FROM audience_segments WHERE workspace_id = ? AND id = ?').run(workspaceId, segmentId).changes > 0;
}

export function contactStatusesForFilters(): ReadonlySet<ContactStatus> {
  return new Set<ContactStatus>(['pending', 'confirmed', 'unsubscribed', 'bounced', 'complained']);
}
