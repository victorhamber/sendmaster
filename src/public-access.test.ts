import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allowPublicPost, isSubscriberRequest } from './public-access.js';

test('cadastro e descadastro não pedem o login de administração', () => {
  assert.equal(isSubscriberRequest('GET', '/forms/11111111-1111-1111-1111-111111111111'), true);
  assert.equal(isSubscriberRequest('POST', '/api/forms/abc/submissions'), true);
  assert.equal(isSubscriberRequest('GET', '/forms/confirm'), true);
  assert.equal(isSubscriberRequest('POST', '/unsubscribe'), true);
  assert.equal(isSubscriberRequest('GET', '/'), false);
  assert.equal(isSubscriberRequest('GET', '/api/bootstrap'), false);
  assert.equal(isSubscriberRequest('POST', '/api/workspaces/default/contacts'), false);
});

test('o formulário público limita repetição do mesmo endereço', () => {
  const now = Date.now();
  for (let index = 0; index < 20; index += 1) assert.equal(allowPublicPost('203.0.113.5', now + index), true);
  assert.equal(allowPublicPost('203.0.113.5', now + 21), false);
  assert.equal(allowPublicPost('203.0.113.6', now + 21), true);
});
