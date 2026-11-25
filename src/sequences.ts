// Sequência linear. O avanço só grava a fila. Quem envia continua sendo o worker da campanha.
import { randomUUID } from 'node:crypto';
import { enqueueCampaignContact } from './campaign-queue.js';
import { db } from './storage.js';

export type SequenceStep =
  | { kind: 'email'; campaignId: string }
  | { kind: 'wait'; hours: number }
  | { kind: 'condition'; when: 'opened' | 'not_opened' | 'clicked' | 'not_clicked' };

type Enrollment = {
  id: string; workspaceId: string; contactId: string; stepIndex: number; lastMessageId: string | null; stepsJson: string;
};

const conditions = new Set(['opened', 'not_opened', 'clicked', 'not_clicked']);

function cleanSteps(workspaceId: string, steps: SequenceStep[]): SequenceStep[] | null {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 12 || steps[0]?.kind !== 'email') return null;
  let sawEmail = false;
  const clean: SequenceStep[] = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') return null;
    if (step.kind === 'email' && typeof step.campaignId === 'string') {
      if (!db.prepare('SELECT id FROM campaign_drafts WHERE workspace_id = ? AND id = ?').get(workspaceId, step.campaignId)) return null;
      sawEmail = true;
      clean.push({ kind: 'email', campaignId: step.campaignId });
    } else if (step.kind === 'wait') {
      if (!Number.isInteger(step.hours) || step.hours < 1 || step.hours > 8760) return null;
      clean.push({ kind: 'wait', hours: step.hours });
    } else if (step.kind === 'condition' && conditions.has(step.when) && sawEmail) {
      clean.push({ kind: 'condition', when: step.when });
    } else return null;
  }
  return clean;
}

export function saveSequence(workspaceId: string, name: string, steps: SequenceStep[]): string | null {
  const cleanName = name.trim();
  const clean = cleanSteps(workspaceId, steps);
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId) || !cleanName || cleanName.length > 100 || !clean) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sequences (id, workspace_id, name, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, workspaceId, cleanName, JSON.stringify(clean), now, now);
  return id;
}

export function listSequences(workspaceId: string): Array<{ id: string; name: string; steps: SequenceStep[] }> {
  return (db.prepare('SELECT id, name, steps_json AS stepsJson FROM sequences WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as Array<{ id: string; name: string; stepsJson: string }>)
    .map(row => ({ id: row.id, name: row.name, steps: JSON.parse(row.stepsJson) as SequenceStep[] }));
}

export function enrollSequence(workspaceId: string, sequenceId: string, contactId: string, now = new Date()): boolean {
  const sequence = db.prepare('SELECT id FROM sequences WHERE workspace_id = ? AND id = ?').get(workspaceId, sequenceId);
  const contact = db.prepare(`SELECT status FROM contacts WHERE workspace_id = ? AND id = ?`).get(workspaceId, contactId) as { status: string } | undefined;
  if (!sequence || contact?.status !== 'confirmed') return false;
  const stamp = now.toISOString();
  db.prepare(`INSERT OR IGNORE INTO sequence_enrollments
    (id, workspace_id, sequence_id, contact_id, step_index, status, next_at, last_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, 'active', ?, NULL, ?, ?)`).run(randomUUID(), workspaceId, sequenceId, contactId, stamp, stamp, stamp);
  return true;
}

function conditionMet(messageId: string | null, when: SequenceStep & { kind: 'condition' }): boolean {
  if (!messageId || when.kind !== 'condition') return false;
  const message = db.prepare(`SELECT open_count AS openCount FROM campaign_messages WHERE id = ? AND status = 'sent'`).get(messageId) as { openCount: number } | undefined;
  if (!message) return false;
  const clicked = Boolean(db.prepare('SELECT 1 FROM message_clicks WHERE message_id = ? LIMIT 1').get(messageId));
  if (when.when === 'opened') return message.openCount > 0;
  if (when.when === 'not_opened') return message.openCount === 0;
  if (when.when === 'clicked') return clicked;
  return !clicked;
}

function progress(row: Enrollment, now: Date): void {
  const steps = JSON.parse(row.stepsJson) as SequenceStep[];
  let index = row.stepIndex;
  let lastMessageId = row.lastMessageId;
  for (let guard = 0; guard < 12; guard += 1) {
    const step = steps[index];
    const stamp = new Date().toISOString();
    if (!step) {
      db.prepare(`UPDATE sequence_enrollments SET status = 'done', step_index = ?, last_message_id = ?, updated_at = ? WHERE id = ?`)
        .run(index, lastMessageId, stamp, row.id);
      return;
    }
    if (step.kind === 'email') {
      const messageId = enqueueCampaignContact(row.workspaceId, step.campaignId, row.contactId);
      const message = messageId
        ? db.prepare('SELECT status FROM campaign_messages WHERE id = ?').get(messageId) as { status: string }
        : undefined;
      if (!message || message.status === 'failed' || message.status === 'bounced' || message.status === 'suppressed') {
        db.prepare(`UPDATE sequence_enrollments SET status = 'stopped', last_message_id = ?, updated_at = ? WHERE id = ?`).run(messageId, stamp, row.id);
        return;
      }
      lastMessageId = messageId;
      if (message.status !== 'sent') {
        db.prepare(`UPDATE sequence_enrollments SET step_index = ?, last_message_id = ?, next_at = ?, updated_at = ? WHERE id = ?`)
          .run(index, lastMessageId, new Date(now.getTime() + 60_000).toISOString(), stamp, row.id);
        return;
      }
      index += 1;
      continue;
    }
    if (step.kind === 'wait') {
      db.prepare(`UPDATE sequence_enrollments SET step_index = ?, last_message_id = ?, next_at = ?, updated_at = ? WHERE id = ?`)
        .run(index + 1, lastMessageId, new Date(now.getTime() + step.hours * 60 * 60 * 1000).toISOString(), stamp, row.id);
      return;
    }
    if (!conditionMet(lastMessageId, step)) {
      db.prepare(`UPDATE sequence_enrollments SET status = 'stopped', step_index = ?, last_message_id = ?, updated_at = ? WHERE id = ?`)
        .run(index, lastMessageId, stamp, row.id);
      return;
    }
    index += 1;
  }
}

export function advanceSequences(now: Date): void {
  const due = db.prepare(`SELECT e.id, e.workspace_id AS workspaceId, e.contact_id AS contactId, e.step_index AS stepIndex,
    e.last_message_id AS lastMessageId, s.steps_json AS stepsJson
    FROM sequence_enrollments e JOIN sequences s ON s.id = e.sequence_id
    WHERE e.status = 'active' AND e.next_at <= ? ORDER BY e.next_at LIMIT 20`).all(now.toISOString()) as Enrollment[];
  for (const row of due) {
    const claimed = db.prepare(`UPDATE sequence_enrollments SET next_at = ?, updated_at = ? WHERE id = ? AND status = 'active' AND next_at <= ?`)
      .run(new Date(now.getTime() + 60_000).toISOString(), new Date().toISOString(), row.id, now.toISOString());
    if (claimed.changes) progress(row, now);
  }
}
