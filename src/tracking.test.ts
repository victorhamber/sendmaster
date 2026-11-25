import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { randomUUID } from 'node:crypto';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-track-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const tracking = await import('./tracking.js');
const { isSubscriberRequest } = await import('./public-access.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

const baseUrl = 'https://email.exemplo.com';

function sentMessage(): { workspaceId: string; campaignId: string; messageId: string } {
  const now = new Date().toISOString();
  const workspaceId = randomUUID();
  const campaignId = randomUUID();
  const contactId = randomUUID();
  const messageId = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(workspaceId, now);
  db.prepare(`INSERT INTO campaign_drafts (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
    VALUES (?, ?, 'Semana', 'Assunto', '', '<p>Oi</p>', 'Oi', ?, ?)`).run(campaignId, workspaceId, now, now);
  db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, phone, source, status, consent_at, consent_evidence, created_at, updated_at)
    VALUES (?, ?, 'ana@example.com', 'ana@example.com', 'Ana', '', 'teste', 'confirmed', ?, 'ok', ?, ?)`).run(contactId, workspaceId, now, now, now);
  db.prepare(`INSERT INTO campaign_messages (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'sent', 1, ?, '', ?, ?, ?)`).run(messageId, workspaceId, campaignId, contactId, now, now, now, now);
  return { workspaceId, campaignId, messageId };
}

test('o pixel e o clique ficam no corpo e o descadastro não é reescrito', () => {
  const { messageId } = sentMessage();
  const html = '<p>Oi {{nome}}</p><a href="https://exemplo.com/oferta">ver</a><a href="https://email.exemplo.com/unsubscribe?token=abc">sair</a>';
  const text = 'Veja https://exemplo.com/oferta e saia em https://email.exemplo.com/unsubscribe?token=abc';
  const tracked = tracking.trackMessage(messageId, html, text, baseUrl);
  assert.match(tracked.html, /\/mail\/open\?token=/);
  assert.match(tracked.html, /\/mail\/click\?token=/);
  assert.match(tracked.html, /href="https:\/\/email\.exemplo\.com\/unsubscribe\?token=abc"/);
  assert.match(tracked.html, /\{\{nome\}\}/);
  assert.match(tracked.text, /\/mail\/click\?token=/);
  assert.match(tracked.text, /https:\/\/email\.exemplo\.com\/unsubscribe\?token=abc/);
});

test('abertura conta uma vez o horário e o clique só abre a URL gravada', () => {
  const { workspaceId, campaignId, messageId } = sentMessage();
  const tracked = tracking.trackMessage(messageId, '<a href="https://exemplo.com/oferta">ver</a>', 'https://exemplo.com/oferta', baseUrl);
  const openToken = new URL(tracked.html.match(/https:\/\/[^"']+\/mail\/open\?token=([^"']+)/)![0]).searchParams.get('token')!;
  const clickToken = new URL(tracked.html.match(/https:\/\/[^"']+\/mail\/click\?token=([^"']+)/)![0]).searchParams.get('token')!;
  assert.equal(tracking.recordOpen(openToken), true);
  const first = db.prepare(`SELECT opened_at AS openedAt, open_count AS openCount FROM campaign_messages WHERE id = ?`).get(messageId) as { openedAt: string; openCount: number };
  assert.equal(first.openCount, 1);
  assert.equal(tracking.recordOpen(openToken), true);
  const second = db.prepare(`SELECT opened_at AS openedAt, open_count AS openCount FROM campaign_messages WHERE id = ?`).get(messageId) as { openedAt: string; openCount: number };
  assert.equal(second.openCount, 2);
  assert.equal(second.openedAt, first.openedAt);
  assert.equal(tracking.recordClick('token-falso'), null);
  assert.equal(tracking.recordClick(clickToken), 'https://exemplo.com/oferta');
  assert.equal(tracking.recordClick(clickToken), 'https://exemplo.com/oferta');
  const report = tracking.campaignReport(workspaceId).find(row => row.campaignId === campaignId);
  assert.equal(report?.sent, 1);
  assert.equal(report?.opened, 1);
  assert.equal(report?.clicked, 1);
  assert.match(tracking.reportCsv(tracking.campaignReport(workspaceId)), /Semana,1,1,1/);
});

test('pixel e clique abrem sem a sessão do administrador', () => {
  assert.equal(isSubscriberRequest('GET', '/mail/open'), true);
  assert.equal(isSubscriberRequest('GET', '/mail/click'), true);
  assert.equal(isSubscriberRequest('GET', '/api/workspaces/default/reports'), false);
});

test('a visão geral usa contagem real', () => {
  const { workspaceId } = sentMessage();
  const overview = tracking.workspaceOverview(workspaceId);
  assert.equal(overview.confirmed, 1);
  assert.equal(overview.sent, 1);
  assert.equal(overview.opened, 0);
  assert.equal(overview.bounced, 0);
});
