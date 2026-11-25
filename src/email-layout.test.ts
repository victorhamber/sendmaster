import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderEmailHtml, renderEmailText } from '../email-layout.js';

test('o construtor escapa texto, aceita só https e tira script', () => {
  const html = renderEmailHtml([
    { type: 'heading', text: '<b>Oi</b>' },
    { type: 'button', text: 'Abrir', url: 'http://inseguro.example' },
    { type: 'image', text: 'foto', url: 'https://cdn.example/a.png' },
    { type: 'html', html: '<p onclick="alert(1)">ok</p><script>alert(1)</script>' },
  ]);
  assert.match(html, /&lt;b&gt;Oi&lt;\/b&gt;/);
  assert.match(html, /href="#"/);
  assert.doesNotMatch(html, /http:\/\/inseguro/);
  assert.match(html, /src="https:\/\/cdn\.example\/a\.png"/);
  assert.doesNotMatch(html, /script|onclick/i);
  assert.match(renderEmailText([{ type: 'button', text: 'Abrir', url: 'https://site.example' }]), /https:\/\/site\.example/);
});
