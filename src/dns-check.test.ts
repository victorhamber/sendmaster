import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeDns } from './dns-check.js';

test('reconhece SPF, DMARC e DKIM publicados', () => {
  const result = judgeDns('exemplo.com', 'resend', {
    spf: ['v=spf1 include:amazonses.com -all'],
    dmarc: ['v=DMARC1; p=none'],
    dkim: ['v=DKIM1; p=abc'],
  });
  assert.equal(result.spf.found, true);
  assert.equal(result.spf.name, 'exemplo.com');
  assert.equal(result.dmarc.found, true);
  assert.equal(result.dmarc.name, '_dmarc.exemplo.com');
  assert.equal(result.dkim.found, true);
  assert.equal(result.dkim.name, 'resend._domainkey.exemplo.com');
  const missing = judgeDns('exemplo.com', 's1', { spf: ['google-site-verification=1'], dmarc: [], dkim: [] });
  assert.equal(missing.spf.found, false);
  assert.equal(missing.dmarc.found, false);
  assert.equal(missing.dkim.found, false);
});
