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
  const styled = renderEmailHtml([
    { type: 'text', text: 'Olá', url: 'https://site.example/oi', font: 'arial', fontSize: 18, color: '#112233', bold: 'yes', align: 'center' },
    { type: 'button', text: 'Ir', url: 'https://site.example/go', background: '#445566', color: 'red;background:url(x)', fontSize: 99 },
  ]);
  assert.match(styled, /font-family:Arial/);
  assert.match(styled, /font-size:18px/);
  assert.match(styled, /#112233/);
  assert.match(styled, /text-align:center/);
  assert.match(styled, /href="https:\/\/site\.example\/oi"/);
  assert.match(styled, /background:#445566/);
  assert.doesNotMatch(styled, /url\(x\)|font-size:99px/);
  const branded = renderEmailHtml([
    { type: 'social', networks: [{ type: 'facebook', url: 'https://facebook.com/acme' }, { type: 'instagram', url: 'http://inseguro.example' }] },
    { type: 'footer', text: 'nota' },
  ], { company: 'Acme Ltda', privacyUrl: 'https://acme.example/privacidade', termsUrl: 'https://acme.example/termos' });
  assert.match(branded, /data:image\/png;base64,/);
  assert.match(branded, /alt="Facebook"/);
  assert.doesNotMatch(branded, />Facebook</);
  assert.match(branded, /Acme Ltda/);
  assert.match(branded, /href="\{\{descadastro\}\}"/);
  assert.match(branded, /href="https:\/\/acme\.example\/privacidade"/);
  assert.match(branded, /href="https:\/\/acme\.example\/termos"/);
  assert.doesNotMatch(branded, /http:\/\/inseguro/);
});
