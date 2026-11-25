import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-callback-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const { saveMailSettings } = await import('./mailer-settings.js');
const callback = await import('./provider-callback.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

const secret = 'chave-de-webhook-teste';

function workspace(providerId: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(id, now);
  saveMailSettings(id, {
    providerId: providerId as 'mailgun', senderEmail: 'envio@example.com', senderName: 'Teste', replyTo: '',
    apiKey: 'api', webhookSecret: secret,
  });
  return id;
}

function sentMessage(workspaceId: string, email: string, providerMessageId: string): string {
  const now = new Date().toISOString();
  const contactId = randomUUID();
  const campaignId = randomUUID();
  const messageId = randomUUID();
  db.prepare(`INSERT INTO contacts (id, workspace_id, email, email_normalized, name, phone, source, status, consent_at, consent_evidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'Ana', '', 'teste', 'confirmed', ?, 'teste', ?, ?)`).run(contactId, workspaceId, email, email, now, now, now);
  db.prepare(`INSERT INTO campaign_drafts (id, workspace_id, name, subject, preheader, html_body, text_body, created_at, updated_at)
    VALUES (?, ?, 'Semana', 'Assunto', '', '<p>Oi</p>', 'Oi', ?, ?)`).run(campaignId, workspaceId, now, now);
  db.prepare(`INSERT INTO campaign_messages (id, workspace_id, campaign_id, contact_id, status, attempts, next_attempt_at, last_error, sent_at, provider_message_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'sent', 1, ?, '', ?, ?, ?, ?)`).run(messageId, workspaceId, campaignId, contactId, now, now, providerMessageId, now, now);
  return contactId;
}

function statusOf(contactId: string): string {
  return (db.prepare('SELECT status FROM contacts WHERE id = ?').get(contactId) as { status: string }).status;
}

function mailgunBody(messageId: string, eventId: string): string {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = 'a'.repeat(50);
  const signature = createHmac('sha256', secret).update(timestamp + token).digest('hex');
  return JSON.stringify({
    signature: { timestamp, token, signature },
    'event-data': { event: 'failed', severity: 'permanent', id: eventId, recipient: 'outro@example.com', message: { headers: { 'message-id': messageId } } },
  });
}

test('bounce assinado do Mailgun altera só o contato da mensagem e a repetição não duplica', () => {
  const workspaceId = workspace('mailgun');
  const contactId = sentMessage(workspaceId, 'pessoa@example.com', 'msg-1');
  const otherId = sentMessage(workspaceId, 'outro@example.com', 'msg-2');
  const raw = mailgunBody('msg-1', 'evt-1');
  const first = callback.acceptProviderCallback({ workspaceId, provider: 'mailgun', rawBody: raw, headers: {} });
  const second = callback.acceptProviderCallback({ workspaceId, provider: 'mailgun', rawBody: raw, headers: {} });
  assert.equal(first.accepted, true);
  if (first.accepted) assert.equal(first.applied, 1);
  assert.equal(second.accepted, true);
  if (second.accepted) assert.equal(second.duplicate, 1);
  assert.equal(statusOf(contactId), 'bounced');
  assert.equal(statusOf(otherId), 'confirmed');
  assert.equal((db.prepare(`SELECT status FROM campaign_messages WHERE provider_message_id = 'msg-1'`).get() as { status: string }).status, 'bounced');
});

test('assinatura inválida não muda contato', () => {
  const workspaceId = workspace('mailgun');
  const contactId = sentMessage(workspaceId, 'pessoa@example.com', 'msg-3');
  const forged = JSON.parse(mailgunBody('msg-3', 'evt-2')) as { signature: { signature: string } };
  forged.signature.signature = '0'.repeat(64);
  const result = callback.acceptProviderCallback({ workspaceId, provider: 'mailgun', rawBody: JSON.stringify(forged), headers: {} });
  assert.equal(result.accepted, false);
  assert.equal(statusOf(contactId), 'confirmed');
});

test('mensagem desconhecida não suprime pelo e-mail do payload', () => {
  const workspaceId = workspace('mailgun');
  const contactId = sentMessage(workspaceId, 'outro@example.com', 'msg-4');
  const result = callback.acceptProviderCallback({ workspaceId, provider: 'mailgun', rawBody: mailgunBody('nao-existe', 'evt-3'), headers: {} });
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.applied, 0);
  assert.equal(statusOf(contactId), 'confirmed');
});

test('Resend só entra com assinatura Svix', () => {
  const workspaceId = workspace('resend');
  const whsec = Buffer.from('segredo-svix-32-bytes-exatos!!').toString('base64');
  saveMailSettings(workspaceId, {
    providerId: 'resend', senderEmail: 'envio@example.com', senderName: 'Teste', replyTo: '',
    apiKey: 'api', webhookSecret: `whsec_${whsec}`,
  });
  const contactId = sentMessage(workspaceId, 'pessoa@example.com', 'email_1');
  const raw = JSON.stringify({ type: 'email.bounced', data: { email_id: 'email_1', to: ['outro@example.com'] } });
  const id = 'msg_teste';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', Buffer.from(whsec, 'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
  const ok = callback.acceptProviderCallback({
    workspaceId, provider: 'resend', rawBody: raw,
    headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` },
  });
  const bad = callback.acceptProviderCallback({
    workspaceId, provider: 'resend', rawBody: raw,
    headers: { 'svix-id': id, 'svix-timestamp': timestamp, 'svix-signature': 'v1,assinatura-errada' },
  });
  assert.equal(ok.accepted, true);
  assert.equal(bad.accepted, false);
  assert.equal(statusOf(contactId), 'bounced');
});
