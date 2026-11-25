import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { after, test } from 'node:test';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-outbox-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const outbound = await import('./outbound.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

function workspace(): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(id, new Date().toISOString());
  return id;
}

test('entrega o evento uma vez e assina o corpo', async () => {
  const workspaceId = workspace();
  assert.equal(outbound.saveOutboundEndpoint(workspaceId, 'http://127.0.0.1/hook', 'segredo-8'), null);
  const endpoint = outbound.saveOutboundEndpoint(workspaceId, 'https://hooks.example.com/sendmaster', 'segredo-8');
  assert.ok(endpoint);
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, 'contact.created', 'c1', '{"email":"a@example.com"}', ?)`).run(randomUUID(), workspaceId, new Date().toISOString());
  outbound.enqueuePendingDeliveries(10);
  const seen: string[] = [];
  const now = new Date(Date.now() + 1000);
  await outbound.processOutboundBatch({
    now, limit: 10,
    deliver: async delivery => {
      const expected = createHmac('sha256', 'segredo-8').update(delivery.body).digest('hex');
      assert.equal(delivery.signature, expected);
      seen.push(delivery.body);
    },
  });
  await outbound.processOutboundBatch({ now, limit: 10, deliver: async () => { seen.push('de novo'); } });
  assert.equal(seen.length, 1);
  assert.match(seen[0], /contact\.created/);
});

test('falha transitória reagenda a entrega', async () => {
  const workspaceId = workspace();
  const endpoint = outbound.saveOutboundEndpoint(workspaceId, 'https://hooks.example.com/outro', 'segredo-8');
  assert.ok(endpoint);
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, 'contact.created', 'c2', '{}', ?)`).run(randomUUID(), workspaceId, new Date().toISOString());
  outbound.enqueuePendingDeliveries(10);
  const now = new Date(Date.now() + 1000);
  await outbound.processOutboundBatch({ now, limit: 10, deliver: async () => { throw new Error('destino fora'); } });
  let called = 0;
  await outbound.processOutboundBatch({ now, limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 0);
  const row = db.prepare('SELECT status, attempts FROM outbound_deliveries WHERE endpoint_id = ?').get(endpoint.id) as { status: string; attempts: number };
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
});

test('entrega interrompida volta para a fila', async () => {
  const workspaceId = workspace();
  const endpoint = outbound.saveOutboundEndpoint(workspaceId, 'https://hooks.example.com/preso', 'segredo-8');
  assert.ok(endpoint);
  const created = new Date().toISOString();
  db.prepare(`INSERT INTO integration_events (event_id, workspace_id, event_type, aggregate_id, payload_json, created_at)
    VALUES (?, ?, 'contact.created', 'c3', '{}', ?)`).run(randomUUID(), workspaceId, created);
  const eventRow = db.prepare('SELECT id FROM integration_events WHERE workspace_id = ? AND aggregate_id = ?').get(workspaceId, 'c3') as { id: number };
  const stale = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO outbound_deliveries (id, endpoint_id, event_row_id, status, attempts, next_attempt_at, last_error, created_at, updated_at)
    VALUES (?, ?, ?, 'sending', 0, ?, '', ?, ?)`).run(randomUUID(), endpoint.id, eventRow.id, stale, stale, stale);
  let called = 0;
  await outbound.processOutboundBatch({ now: new Date(Date.now() + 1000), limit: 10, deliver: async () => { called += 1; } });
  assert.equal(called, 1);
});
