import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTrustedClientIp, normalizeTrustedClientIp } from '../trusted-client-ip-v1.mjs';

test('CF-Connecting-IP validado prevalece sobre X-Forwarded-For forjado',()=>{
  const req={headers:{'cf-connecting-ip':'198.51.100.42','x-forwarded-for':'203.0.113.77, 192.0.2.10'},socket:{remoteAddress:'10.0.0.5'}};
  assert.deepEqual(resolveTrustedClientIp(req),{ip:'198.51.100.42',source:'cf-connecting-ip'});
});

test('sem Cloudflare usa o último IP válido da cadeia X-Forwarded-For',()=>{
  const req={headers:{'x-forwarded-for':'203.0.113.77, 198.51.100.8'},socket:{remoteAddress:'10.0.0.5'}};
  assert.deepEqual(resolveTrustedClientIp(req),{ip:'198.51.100.8',source:'x-forwarded-for-rightmost'});
});

test('ignora candidatos inválidos e normaliza IPv4 mapeado em IPv6',()=>{
  const req={headers:{'cf-connecting-ip':'not-an-ip','x-forwarded-for':'garbage'},socket:{remoteAddress:'::ffff:127.0.0.1'}};
  assert.deepEqual(resolveTrustedClientIp(req),{ip:'127.0.0.1',source:'socket'});
});

test('normalização substitui X-Forwarded-For controlável pelo valor confiável',()=>{
  const req={headers:{'cf-connecting-ip':'198.51.100.99','x-forwarded-for':'1.2.3.4'},socket:{remoteAddress:'10.0.0.5'}};
  const resolved=normalizeTrustedClientIp(req);
  assert.equal(resolved.ip,'198.51.100.99');
  assert.equal(req.headers['x-forwarded-for'],'198.51.100.99');
});
