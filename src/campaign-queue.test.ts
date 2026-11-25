import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-queue-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const queue = await import('./campaign-queue.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

function clock(): Date {
  return new Date(Date.now() + 1000);
}

function workspace(): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(id, new Date().toISOString());
  return id;
}

function campaign(workspaceId: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO campaign_drafts (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
    VALUES (?, ?, 'Semana', 'Assunto', '', '<p>Oi</p>', 'Oi', ?, ?)`).run(id, workspaceId, now, now);
  return id;
}

function contact(workspaceId: string, email: string, status: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, phone, source, status, consent_at, consent_evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Ana', '', 'teste', ?, ?, 'teste', ?, ?)`).run(id, workspaceId, email, email.toLowerCase(), status, status === 'confirmed' ? now : null, now, now);
  return id;
}

function messages(campaignId: string): Array<{ contactId: string; status: string; attempts: number }> {
  return db.prepare(`SELECT contact_id AS contactId, status, attempts FROM campaign_messages WHERE campaign_id = ? ORDER BY created_at`).all(campaignId) as Array<{ contactId: string; status: string; attempts: number }>;
}

test('agendamento segura o envio até o horário', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const contactId = contact(workspaceId, 'agendar@example.com', 'confirmed');
  const sendAt = new Date(Date.now() + 60 * 60 * 1000);
  queue.enqueueCampaign(workspaceId, campaignId, null, sendAt);
  const sent: string[] = [];
  await queue.processCampaignBatch({ now: clock(), limit: 10, deliver: async message => { sent.push(message.contactId); } });
  assert.deepEqual(sent.filter(id => id === contactId), []);
  await queue.processCampaignBatch({ now: sendAt, limit: 10, deliver: async message => { sent.push(message.contactId); } });
  assert.deepEqual(sent.filter(id => id === contactId), [contactId]);
});

test('enfileira cada contato confirmado uma única vez', () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const first = contact(workspaceId, 'a@example.com', 'confirmed');
  contact(workspaceId, 'b@example.com', 'pending');
  const firstPass = queue.enqueueCampaign(workspaceId, campaignId, null);
  const secondPass = queue.enqueueCampaign(workspaceId, campaignId, null);
  assert.deepEqual(firstPass, { queued: 1, alreadyQueued: 0 });
  assert.deepEqual(secondPass, { queued: 0, alreadyQueued: 1 });
  assert.deepEqual(messages(campaignId).map(row => row.contactId), [first]);
});

test('o worker envia fora da fila e não repete quem já recebeu', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const contactId = contact(workspaceId, 'c@example.com', 'confirmed');
  queue.enqueueCampaign(workspaceId, campaignId, null);
  const sent: string[] = [];
  const now = clock();
  await queue.processCampaignBatch({ now, limit: 10, deliver: async message => { sent.push(message.contactId); } });
  await queue.processCampaignBatch({ now, limit: 10, deliver: async message => { sent.push(message.contactId); } });
  assert.deepEqual(sent.filter(id => id === contactId), [contactId]);
  assert.equal(messages(campaignId)[0]?.status, 'sent');
});

test('recusa contato suprimido na hora do disparo', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const contactId = contact(workspaceId, 'd@example.com', 'confirmed');
  queue.enqueueCampaign(workspaceId, campaignId, null);
  db.prepare(`UPDATE contacts SET status = 'unsubscribed' WHERE id = ?`).run(contactId);
  let called = 0;
  await queue.processCampaignBatch({ now: clock(), limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 0);
  assert.equal(messages(campaignId)[0]?.status, 'suppressed');
});

test('falha transitória reagenda e endereço inválido vira bounce', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  contact(workspaceId, 'e@example.com', 'confirmed');
  const invalidId = contact(workspaceId, 'sem-arroba', 'confirmed');
  queue.enqueueCampaign(workspaceId, campaignId, null);
  const now = clock();
  await queue.processCampaignBatch({
    now, limit: 10,
    deliver: async () => { throw new Error('tempo esgotado'); },
  });
  const rows = messages(campaignId);
  const retry = rows.find(row => row.contactId !== invalidId);
  const invalid = rows.find(row => row.contactId === invalidId);
  assert.equal(retry?.status, 'queued');
  assert.equal(retry?.attempts, 1);
  assert.equal(invalid?.status, 'bounced');
  assert.equal((db.prepare(`SELECT status FROM contacts WHERE id = ?`).get(invalidId) as { status: string }).status, 'bounced');
  let called = 0;
  await queue.processCampaignBatch({ now, limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 0);
});

test('frequência de marketing adia o envio sem consumir a cota de confirmação', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const contactId = contact(workspaceId, 'f@example.com', 'confirmed');
  const now = clock();
  for (let index = 0; index < 5; index += 1) {
    const previous = campaign(workspaceId);
    db.prepare(`INSERT INTO campaign_messages (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'sent', 1, ?, '', ?, ?, ?)`).run(randomUUID(), workspaceId, previous, contactId, now.toISOString(), now.toISOString(), now.toISOString(), now.toISOString());
  }
  queue.enqueueCampaign(workspaceId, campaignId, null);
  let called = 0;
  await queue.processCampaignBatch({ now, limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 0);
  assert.equal(messages(campaignId)[0]?.status, 'queued');
  assert.equal(messages(campaignId)[0]?.attempts, 0);
});

test('envio interrompido volta para a fila', async () => {
  const workspaceId = workspace();
  const campaignId = campaign(workspaceId);
  const contactId = contact(workspaceId, 'preso@example.com', 'confirmed');
  const now = clock();
  const stale = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO campaign_messages (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'sending', 1, ?, '', NULL, ?, ?)`).run(randomUUID(), workspaceId, campaignId, contactId, stale, stale, stale);
  let called = 0;
  await queue.processCampaignBatch({ now, limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 1);
  assert.equal(messages(campaignId)[0]?.status, 'sent');
});
