import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const databasePath = join(mkdtempSync(join(tmpdir(), 'sendmaster-templates-')), 'test.sqlite');
process.env.SENDMASTER_DB_PATH = databasePath;

const { db } = await import('./storage.js');
const templates = await import('./templates.js');
const { saveCampaignDraft, getCampaignDraft } = await import('./campaigns.js');

after(() => {
  db.close();
  rmSync(join(databasePath, '..'), { recursive: true, force: true });
});

test('o modelo copiado não muda o rascunho já salvo', () => {
  const workspaceId = randomUUID();
  db.prepare(`INSERT INTO workspaces (id, name, product, created_at) VALUES (?, 'Teste', '', ?)`).run(workspaceId, new Date().toISOString());
  const saved = templates.saveEmailTemplate(workspaceId, { name: 'Boas-vindas', subject: 'Olá, {{nome}}', preheader: '', html: '<p>{{nome}}</p>', text: '{{nome}}' });
  assert.ok(saved);
  const draft = saveCampaignDraft(workspaceId, { name: 'Campanha', subject: saved.subject, preheader: saved.preheader, html: saved.html, text: saved.text });
  assert.ok(draft);
  templates.saveEmailTemplate(workspaceId, { name: 'Boas-vindas', subject: 'Mudou', preheader: '', html: '<p>novo</p>', text: 'novo' }, saved.id);
  const current = getCampaignDraft(workspaceId, draft.id);
  assert.equal(current?.subject, 'Olá, {{nome}}');
  assert.equal(templates.listEmailTemplates(workspaceId)[0]?.subject, 'Mudou');
});
