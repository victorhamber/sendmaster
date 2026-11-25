import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-sequence-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const sequences = await import('./sequences.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

const start = new Date('2026-11-25T12:00:00.000Z');

function workspace(): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(id, start.toISOString());
  return id;
}

function campaign(workspaceId: string, name: string): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO campaign_drafts (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
    VALUES (?, ?, ?, 'Assunto', '', '<p>Oi</p>', 'Oi', ?, ?)`).run(id, workspaceId, name, start.toISOString(), start.toISOString());
  return id;
}

function contact(workspaceId: string, status = 'confirmed'): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, phone, source, status, consent_at, consent_evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Ana', '', 'teste', ?, ?, 'ok', ?, ?)`).run(id, workspaceId, `${id}@example.com`, `${id}@example.com`, status, start.toISOString(), start.toISOString(), start.toISOString());
  return id;
}

function messageStatus(campaignId: string, contactId: string): string | undefined {
  return (db.prepare(`SELECT status FROM campaign_messages WHERE campaign_id = ? AND contact_id = ?`).get(campaignId, contactId) as { status: string } | undefined)?.status;
}

test('espera e abertura levam ao próximo e-mail pela fila, sem enviar no avanço', () => {
  const workspaceId = workspace();
  const first = campaign(workspaceId, 'Primeiro');
  const second = campaign(workspaceId, 'Segundo');
  const contactId = contact(workspaceId);
  const sequenceId = sequences.saveSequence(workspaceId, 'Boas-vindas', [
    { kind: 'email', campaignId: first },
    { kind: 'wait', hours: 1 },
    { kind: 'condition', when: 'opened' },
    { kind: 'email', campaignId: second },
  ]);
  assert.ok(sequenceId);
  assert.equal(sequences.enrollSequence(workspaceId, sequenceId!, contactId, start), true);
  sequences.advanceSequences(start);
  assert.equal(messageStatus(first, contactId), 'queued');
  assert.equal(messageStatus(second, contactId), undefined);
  db.prepare(`UPDATE campaign_messages SET status = 'sent', sent_at = ?, open_count = 1, opened_at = ? WHERE campaign_id = ?`).run(start.toISOString(), start.toISOString(), first);
  const afterSend = new Date(start.getTime() + 60_000);
  sequences.advanceSequences(afterSend);
  assert.equal(messageStatus(second, contactId), undefined);
  sequences.advanceSequences(new Date(afterSend.getTime() + 60 * 60 * 1000));
  assert.equal(messageStatus(second, contactId), 'queued');
});

test('sem abertura a sequência para e não enfileira o e-mail seguinte', () => {
  const workspaceId = workspace();
  const first = campaign(workspaceId, 'Primeiro');
  const second = campaign(workspaceId, 'Segundo');
  const contactId = contact(workspaceId);
  const sequenceId = sequences.saveSequence(workspaceId, 'Só quem abriu', [
    { kind: 'email', campaignId: first },
    { kind: 'wait', hours: 1 },
    { kind: 'condition', when: 'opened' },
    { kind: 'email', campaignId: second },
  ])!;
  sequences.enrollSequence(workspaceId, sequenceId, contactId, start);
  sequences.advanceSequences(start);
  db.prepare(`UPDATE campaign_messages SET status = 'sent', sent_at = ? WHERE campaign_id = ?`).run(start.toISOString(), first);
  const afterSend = new Date(start.getTime() + 60_000);
  sequences.advanceSequences(afterSend);
  sequences.advanceSequences(new Date(afterSend.getTime() + 60 * 60 * 1000));
  assert.equal(messageStatus(second, contactId), undefined);
  const enrollment = db.prepare(`SELECT status FROM sequence_enrollments WHERE sequence_id = ? AND contact_id = ?`).get(sequenceId, contactId) as { status: string };
  assert.equal(enrollment.status, 'stopped');
  assert.equal(sequences.saveSequence(workspaceId, 'Inválida', [{ kind: 'condition', when: 'opened' }]), null);
  assert.equal(sequences.enrollSequence(workspaceId, sequenceId, contact(workspaceId, 'pending')), false);
});

test('a condição segue o sim ou o não', () => {
  const workspaceId = workspace();
  const first = campaign(workspaceId, 'Primeiro');
  const yes = campaign(workspaceId, 'Abriu');
  const no = campaign(workspaceId, 'Não abriu');
  const opened = contact(workspaceId);
  const closed = contact(workspaceId);
  const sequenceId = sequences.saveSequence(workspaceId, 'Ramo', {
    start: 'a',
    nodes: [
      { id: 'a', kind: 'email', campaignId: first, next: 'c' },
      { id: 'c', kind: 'condition', when: 'opened', yes: 'y', no: 'n' },
      { id: 'y', kind: 'email', campaignId: yes, next: null },
      { id: 'n', kind: 'email', campaignId: no, next: null },
    ],
  });
  assert.ok(sequenceId);
  sequences.enrollSequence(workspaceId, sequenceId!, opened, start);
  sequences.enrollSequence(workspaceId, sequenceId!, closed, start);
  sequences.advanceSequences(start);
  db.prepare(`UPDATE campaign_messages SET status = 'sent', sent_at = ?, open_count = 1 WHERE campaign_id = ? AND contact_id = ?`).run(start.toISOString(), first, opened);
  db.prepare(`UPDATE campaign_messages SET status = 'sent', sent_at = ? WHERE campaign_id = ? AND contact_id = ?`).run(start.toISOString(), first, closed);
  sequences.advanceSequences(new Date(start.getTime() + 60_000));
  assert.equal(messageStatus(yes, opened), 'queued');
  assert.equal(messageStatus(no, opened), undefined);
  assert.equal(messageStatus(no, closed), 'queued');
  assert.equal(messageStatus(yes, closed), undefined);
});
