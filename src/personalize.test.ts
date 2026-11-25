import assert from 'node:assert/strict';
import { test } from 'node:test';
import { personalize, withPreheader } from './personalize.js';

test('troca nome e e-mail e escapa HTML', () => {
  const person = { nome: 'Ana <script>', email: 'ana@example.com' };
  assert.equal(personalize('Olá, {{nome}}', person, false), 'Olá, Ana <script>');
  assert.equal(personalize('<p>{{nome}}</p>', person, true), '<p>Ana &lt;script&gt;</p>');
  assert.equal(personalize('{{email}}', person, true), 'ana@example.com');
  assert.equal(personalize('{{outro}}', person, false), '{{outro}}');
});

test('o pré-cabeçalho fica oculto no início do HTML', () => {
  const hidden = withPreheader('<p>Corpo</p>', 'Ana &lt;b&gt;');
  assert.match(hidden, /^<div style="display:none/);
  assert.match(hidden, /Ana &lt;b&gt;/);
  assert.match(hidden, /<p>Corpo<\/p>$/);
  assert.equal(withPreheader('<p>Corpo</p>', ''), '<p>Corpo</p>');
});
