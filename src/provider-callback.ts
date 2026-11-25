// Callback de provedor: só entra com assinatura e só altera o contato da mensagem indicada.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readMailCredentials, type MailProviderId } from './mailer-settings.js';
import { applyProviderMailEvent, type ProviderMailSignal } from './suppressions.js';
import { db } from './storage.js';

const MAILERSEND_TEST_SECRET = 'test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G';
const FRESH_MS = 15 * 60 * 1000;

export type CallbackResult = { accepted: true; applied: number; duplicate: number; ignored: number } | { accepted: false };

type ParsedEvent = { eventId: string; messageId: string; signal: ProviderMailSignal };

export function normalizeProviderMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, '').toLowerCase();
}

function same(left: string, right: string): boolean {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}

function fresh(timestamp: string, now: Date, windowMs = FRESH_MS): boolean {
  const seconds = Number(timestamp);
  return Number.isInteger(seconds) && Math.abs(now.getTime() - seconds * 1000) <= windowMs;
}

function header(headers: Record<string, string | undefined>, name: string): string {
  return headers[name.toLowerCase()] ?? '';
}

function mailgunEvents(rawBody: string, secret: string, now: Date): ParsedEvent[] | null {
  let body: { signature?: { timestamp?: string; token?: string; signature?: string }; 'event-data'?: Record<string, unknown> };
  try { body = JSON.parse(rawBody) as typeof body; } catch { return null; }
  const signature = body.signature;
  if (!signature?.timestamp || !signature.token || !signature.signature || !fresh(signature.timestamp, now)) return null;
  const expected = createHmac('sha256', secret).update(`${signature.timestamp}${signature.token}`).digest('hex');
  if (!same(expected, signature.signature)) return null;
  const data = body['event-data'] ?? {};
  const event = String(data.event ?? '');
  const severity = String(data.severity ?? '');
  const signal: ProviderMailSignal | null = event === 'complained' ? 'complaint' : event === 'failed' && severity === 'permanent' ? 'bounce' : null;
  if (!signal) return [];
  const headers = (data.message as { headers?: Record<string, string> } | undefined)?.headers;
  const messageId = headers?.['message-id'] ?? '';
  const eventId = String(data.id ?? '');
  if (!messageId || !eventId) return [];
  return [{ eventId, messageId, signal }];
}

function resendEvents(rawBody: string, secret: string, headers: Record<string, string | undefined>, now: Date): ParsedEvent[] | null {
  const id = header(headers, 'svix-id');
  const timestamp = header(headers, 'svix-timestamp');
  const signature = header(headers, 'svix-signature');
  if (!id || !fresh(timestamp, now, 5 * 60 * 1000) || !secret.startsWith('whsec_')) return null;
  let key: Buffer;
  try { key = Buffer.from(secret.slice('whsec_'.length), 'base64'); } catch { return null; }
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const match = signature.split(' ').some(part => part.startsWith('v1,') && same(part.slice(3), expected));
  if (!match) return null;
  let body: { type?: string; data?: { email_id?: string } };
  try { body = JSON.parse(rawBody) as typeof body; } catch { return null; }
  const signal: ProviderMailSignal | null = body.type === 'email.bounced' ? 'bounce' : body.type === 'email.complained' ? 'complaint' : null;
  if (!signal || !body.data?.email_id) return signal ? [] : [];
  return [{ eventId: id, messageId: body.data.email_id, signal }];
}

function mailerSendEvents(rawBody: string, secret: string, headers: Record<string, string | undefined>): ParsedEvent[] | null | 'test' {
  const signature = header(headers, 'signature');
  if (!signature) return null;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const testExpected = createHmac('sha256', MAILERSEND_TEST_SECRET).update(rawBody).digest('hex');
  if (!same(signature, expected)) return same(signature, testExpected) ? 'test' : null;
  let body: { type?: string; data?: { id?: string; message_id?: string } };
  try { body = JSON.parse(rawBody) as typeof body; } catch { return null; }
  if (body.type === 'webhook.test') return 'test';
  const signal: ProviderMailSignal | null = body.type === 'activity.hard_bounced' ? 'bounce' : body.type === 'activity.spam_complaint' ? 'complaint' : null;
  if (!signal || !body.data?.id || !body.data.message_id) return [];
  return [{ eventId: body.data.id, messageId: body.data.message_id, signal }];
}

function sparkpostEvents(rawBody: string, secret: string, headers: Record<string, string | undefined>): ParsedEvent[] | null {
  const authorization = header(headers, 'authorization');
  const token = header(headers, 'x-messagesystems-webhook-token');
  const basic = authorization.toLowerCase().startsWith('basic ') ? Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8') : '';
  const colon = basic.indexOf(':');
  const basicOk = colon > 0 && same(basic.slice(0, colon), 'sendmaster') && same(basic.slice(colon + 1), secret);
  if (!basicOk && !same(token, secret)) return null;
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return null; }
  if (!Array.isArray(body)) return null;
  const events: ParsedEvent[] = [];
  for (const item of body) {
    const wrapped = (item as { msys?: Record<string, { type?: string; event_id?: string; message_id?: string }> }).msys ?? {};
    const event = Object.values(wrapped)[0];
    if (!event?.type || !event.event_id || !event.message_id) continue;
    const signal: ProviderMailSignal | null = event.type === 'spam_complaint' ? 'complaint' : ['bounce', 'out_of_band', 'policy_rejection'].includes(event.type) ? 'bounce' : null;
    if (signal) events.push({ eventId: event.event_id, messageId: event.message_id, signal });
  }
  return events;
}

function verifiedEvents(provider: MailProviderId, rawBody: string, headers: Record<string, string | undefined>, secret: string, now: Date): ParsedEvent[] | null | 'test' {
  if (provider === 'mailgun') return mailgunEvents(rawBody, secret, now);
  if (provider === 'resend') return resendEvents(rawBody, secret, headers, now);
  if (provider === 'mailersend') return mailerSendEvents(rawBody, secret, headers);
  if (provider === 'sparkpost') return sparkpostEvents(rawBody, secret, headers);
  return null;
}

export function acceptProviderCallback(input: {
  workspaceId: string; provider: string; rawBody: string; headers: Record<string, string | undefined>; now?: Date;
}): CallbackResult {
  const credentials = readMailCredentials(input.workspaceId);
  if (!credentials?.webhookSecret || credentials.providerId !== input.provider) return { accepted: false };
  const verified = verifiedEvents(credentials.providerId, input.rawBody, input.headers, credentials.webhookSecret, input.now ?? new Date());
  if (verified === null) return { accepted: false };
  if (verified === 'test') return { accepted: true, applied: 0, duplicate: 0, ignored: 1 };
  let applied = 0;
  let duplicate = 0;
  let ignored = 0;
  for (const event of verified) {
    const messageId = normalizeProviderMessageId(event.messageId);
    const message = db.prepare(`SELECT m.id, c.email FROM campaign_messages m JOIN contacts c ON c.id = m.contact_id AND c.workspace_id = m.workspace_id
      WHERE m.workspace_id = ? AND m.provider_message_id = ?`).get(input.workspaceId, messageId) as { id: string; email: string } | undefined;
    if (!message) {
      const inserted = db.prepare(`INSERT OR IGNORE INTO mail_provider_events (id, workspace_id, provider, provider_event_id, event_type, email_normalized, contact_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, '', NULL, ?, ?)`).run(randomUUID(), input.workspaceId, input.provider, event.eventId, event.signal, JSON.stringify({ messageId, unmatched: true }), new Date().toISOString());
      if (inserted.changes) ignored += 1; else duplicate += 1;
      continue;
    }
    const result = applyProviderMailEvent({ workspaceId: input.workspaceId, provider: input.provider, providerEventId: event.eventId, email: message.email, signal: event.signal, payload: { messageId } });
    if (!result || result.duplicate) { duplicate += 1; continue; }
    if (event.signal === 'bounce') {
      db.prepare(`UPDATE campaign_messages SET status = 'bounced', last_error = ?, updated_at = ? WHERE id = ?`).run('Bounce recebido do provedor.', new Date().toISOString(), message.id);
    } else {
      db.prepare(`UPDATE campaign_messages SET last_error = ?, updated_at = ? WHERE id = ?`).run('Reclamação recebida do provedor.', new Date().toISOString(), message.id);
    }
    applied += 1;
  }
  return { accepted: true, applied, duplicate, ignored };
}
