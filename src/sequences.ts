// Sequência linear. O avanço só grava a fila. Quem envia continua sendo o worker da campanha.
import { randomUUID } from 'node:crypto';
import { enqueueCampaignContact } from './campaign-queue.js';
import { db } from './storage.js';

export type SequenceStep =
  | { kind: 'email'; campaignId: string }
  | { kind: 'wait'; hours: number }
  | { kind: 'condition'; when: 'opened' | 'not_opened' | 'clicked' | 'not_clicked' };

type Enrollment = {
  id: string; workspaceId: string; contactId: string; stepIndex: number; stepId: string | null; lastMessageId: string | null; stepsJson: string;
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

export type FlowNode =
  | { id: string; kind: 'email'; campaignId: string; next: string | null; x?: number; y?: number }
  | { id: string; kind: 'wait'; hours: number; next: string | null; x?: number; y?: number }
  | { id: string; kind: 'condition'; when: 'opened' | 'not_opened' | 'clicked' | 'not_clicked'; yes: string | null; no: string | null; x?: number; y?: number };
export type SequenceFlow = { start: string; nodes: FlowNode[] };

function layout(node: { x?: unknown; y?: unknown }): { x?: number; y?: number } {
  if (!Number.isInteger(node.x) || !Number.isInteger(node.y)) return {};
  const x = node.x as number;
  const y = node.y as number;
  if (x < 0 || y < 0 || x > 4000 || y > 4000) return {};
  return { x, y };
}

function cleanFlow(workspaceId: string, flow: SequenceFlow): SequenceFlow | null {
  if (!flow || !Array.isArray(flow.nodes) || flow.nodes.length < 1 || flow.nodes.length > 12) return null;
  const ids = new Set(flow.nodes.map(node => node.id));
  if (ids.size !== flow.nodes.length || !ids.has(flow.start)) return null;
  const clean: FlowNode[] = [];
  for (const node of flow.nodes) {
    if (!node || typeof node.id !== 'string' || !/^[\w-]{1,40}$/.test(node.id)) return null;
    const link = (value: unknown) => value === null || (typeof value === 'string' && ids.has(value));
    if (node.kind === 'email' && typeof node.campaignId === 'string' && link(node.next)) {
      if (!db.prepare('SELECT id FROM campaign_drafts WHERE workspace_id = ? AND id = ?').get(workspaceId, node.campaignId)) return null;
      clean.push({ id: node.id, kind: 'email', campaignId: node.campaignId, next: node.next, ...layout(node) });
    } else if (node.kind === 'wait' && Number.isInteger(node.hours) && node.hours >= 1 && node.hours <= 8760 && link(node.next)) {
      clean.push({ id: node.id, kind: 'wait', hours: node.hours, next: node.next, ...layout(node) });
    } else if (node.kind === 'condition' && conditions.has(node.when) && link(node.yes) && link(node.no)) {
      clean.push({ id: node.id, kind: 'condition', when: node.when, yes: node.yes, no: node.no, ...layout(node) });
    } else return null;
  }
  if (clean.find(node => node.id === flow.start)?.kind !== 'email') return null;
  return { start: flow.start, nodes: clean };
}

export function saveSequence(workspaceId: string, name: string, steps: SequenceStep[] | SequenceFlow): string | null {
  const cleanName = name.trim();
  const clean = Array.isArray(steps) ? cleanSteps(workspaceId, steps) : cleanFlow(workspaceId, steps);
  if (!db.prepare('SELECT id FROM workspaces WHERE id = ?').get(workspaceId) || !cleanName || cleanName.length > 100 || !clean) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sequences (id, workspace_id, name, steps_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, workspaceId, cleanName, JSON.stringify(clean), now, now);
  return id;
}

export function listSequences(workspaceId: string): Array<{ id: string; name: string; steps: SequenceStep[] | SequenceFlow }> {
  return (db.prepare('SELECT id, name, steps_json AS stepsJson FROM sequences WHERE workspace_id = ? ORDER BY updated_at DESC').all(workspaceId) as Array<{ id: string; name: string; stepsJson: string }>)
    .map(row => ({ id: row.id, name: row.name, steps: JSON.parse(row.stepsJson) as SequenceStep[] | SequenceFlow }));
}

export function enrollSequence(workspaceId: string, sequenceId: string, contactId: string, now = new Date()): boolean {
  const sequence = db.prepare('SELECT steps_json AS stepsJson FROM sequences WHERE workspace_id = ? AND id = ?').get(workspaceId, sequenceId) as { stepsJson: string } | undefined;
  const contact = db.prepare(`SELECT status FROM contacts WHERE workspace_id = ? AND id = ?`).get(workspaceId, contactId) as { status: string } | undefined;
  if (!sequence || contact?.status !== 'confirmed') return false;
  const parsed = JSON.parse(sequence.stepsJson) as SequenceStep[] | SequenceFlow;
  const stepId = Array.isArray(parsed) ? null : parsed.start;
  const stamp = now.toISOString();
  db.prepare(`INSERT OR IGNORE INTO sequence_enrollments
    (id, workspace_id, sequence_id, contact_id, step_index, step_id, status, next_at, last_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, 'active', ?, NULL, ?, ?)`).run(randomUUID(), workspaceId, sequenceId, contactId, stepId, stamp, stamp, stamp);
  return true;
}

function linearToFlow(steps: SequenceStep[]): SequenceFlow {
  const nodes: FlowNode[] = steps.map((step, index) => {
    const id = String(index);
    const next = index + 1 < steps.length ? String(index + 1) : null;
    if (step.kind === 'email') return { id, kind: 'email', campaignId: step.campaignId, next };
    if (step.kind === 'wait') return { id, kind: 'wait', hours: step.hours, next };
    return { id, kind: 'condition', when: step.when, yes: next, no: null };
  });
  return { start: '0', nodes };
}

function asFlow(raw: unknown): SequenceFlow | null {
  if (Array.isArray(raw)) return linearToFlow(raw as SequenceStep[]);
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as SequenceFlow).nodes)) return null;
  return raw as SequenceFlow;
}

function conditionMet(messageId: string | null, when: FlowNode & { kind: 'condition' }): boolean {
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
  const flow = asFlow(JSON.parse(row.stepsJson));
  const stamp = () => new Date().toISOString();
  if (!flow) {
    db.prepare(`UPDATE sequence_enrollments SET status = 'stopped', updated_at = ? WHERE id = ?`).run(stamp(), row.id);
    return;
  }
  const byId = new Map(flow.nodes.map(node => [node.id, node]));
  let current: string | null = row.stepId || flow.nodes[row.stepIndex]?.id || flow.start;
  let lastMessageId = row.lastMessageId;
  const place = (stepId: string | null, status: 'active' | 'done' | 'stopped', nextAt?: string) => {
    const index = stepId ? flow.nodes.findIndex(node => node.id === stepId) : flow.nodes.length;
    db.prepare(`UPDATE sequence_enrollments SET status = ?, step_index = ?, step_id = ?, last_message_id = ?, next_at = COALESCE(?, next_at), updated_at = ? WHERE id = ?`)
      .run(status, Math.max(index, 0), stepId, lastMessageId, nextAt ?? null, stamp(), row.id);
  };
  for (let guard = 0; guard < 12; guard += 1) {
    const step: FlowNode | undefined = current ? byId.get(current) : undefined;
    if (!step) { place(null, 'done'); return; }
    if (step.kind === 'email') {
      const messageId = enqueueCampaignContact(row.workspaceId, step.campaignId, row.contactId);
      const message = messageId ? db.prepare('SELECT status FROM campaign_messages WHERE id = ?').get(messageId) as { status: string } : undefined;
      if (!message || message.status === 'failed' || message.status === 'bounced' || message.status === 'suppressed') {
        lastMessageId = messageId;
        place(current, 'stopped');
        return;
      }
      lastMessageId = messageId;
      if (message.status !== 'sent') {
        place(current, 'active', new Date(now.getTime() + 60_000).toISOString());
        return;
      }
      current = step.next;
      continue;
    }
    if (step.kind === 'wait') {
      place(step.next, step.next ? 'active' : 'done', new Date(now.getTime() + step.hours * 60 * 60 * 1000).toISOString());
      return;
    }
    const target: string | null = conditionMet(lastMessageId, step) ? step.yes : step.no;
    if (!target) { place(current, conditionMet(lastMessageId, step) ? 'done' : 'stopped'); return; }
    current = target;
  }
}

export function advanceSequences(now: Date): void {
  const due = db.prepare(`SELECT e.id, e.workspace_id AS workspaceId, e.contact_id AS contactId, e.step_index AS stepIndex,
    e.step_id AS stepId, e.last_message_id AS lastMessageId, s.steps_json AS stepsJson
    FROM sequence_enrollments e JOIN sequences s ON s.id = e.sequence_id
    WHERE e.status = 'active' AND e.next_at <= ? ORDER BY e.next_at LIMIT 20`).all(now.toISOString()) as Enrollment[];
  for (const row of due) {
    const claimed = db.prepare(`UPDATE sequence_enrollments SET next_at = ?, updated_at = ? WHERE id = ? AND status = 'active' AND next_at <= ?`)
      .run(new Date(now.getTime() + 60_000).toISOString(), new Date().toISOString(), row.id, now.toISOString());
    if (claimed.changes) progress(row, now);
  }
}
