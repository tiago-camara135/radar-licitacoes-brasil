import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hashAccountPassword,verifyAccountPassword,validateRecoveryDocumentSignature} from '../account-recovery-v1.mjs';
import {hashRecoveryPassword,verifyRecoveryPassword} from '../account-recovery-email-v2.mjs';
import {__test as deliveryTest} from '../account-recovery-delivery-v3.mjs';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('password reset uses compatible salted scrypt and never plaintext',()=>{
  const password='UmaSenhaNova!12345';
  const hash=hashAccountPassword(password);
  assert.match(hash,/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(hash.includes(password),false);
  assert.equal(verifyAccountPassword(password,hash),true);
  assert.equal(verifyAccountPassword('senha-errada',hash),false);
  assert.notEqual(hash,hashAccountPassword(password),'same password must receive a new random salt');
  const hotfixHash=hashRecoveryPassword(password);
  assert.equal(verifyRecoveryPassword(password,hotfixHash),true);
  assert.equal(verifyAccountPassword(password,hotfixHash),true,'hotfix hash must remain compatible with core login');
});

test('assisted recovery accepts only PDF PNG JPEG by file signature',()=>{
  assert.equal(validateRecoveryDocumentSignature(Buffer.from('%PDF-1.4\nmock')),'application/pdf');
  assert.equal(validateRecoveryDocumentSignature(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1])),'image/png');
  assert.equal(validateRecoveryDocumentSignature(Buffer.from([0xff,0xd8,0xff,0xe0,1])),'image/jpeg');
  assert.equal(validateRecoveryDocumentSignature(Buffer.from('<script>alert(1)</script>')),null);
});

test('delivery v3 normalizes recipient without exposing raw email in correlation id',()=>{
  assert.equal(deliveryTest.emailOf('  Teste@Example.COM  '),'teste@example.com');
  assert.equal(deliveryTest.allowedRole('user'),true);
  assert.equal(deliveryTest.allowedRole('admin'),true);
  assert.equal(deliveryTest.allowedRole('guest'),false);
  const h=deliveryTest.recipientHash('teste@example.com');
  assert.match(h,/^[0-9a-f]{24}$/);
  assert.equal(h.includes('teste'),false);
});

test('runtime preserves production chain and recovery delivery has provider telemetry',()=>{
  const pkg=JSON.parse(read('package.json'));
  const deliveryRuntime=read('production-v28.mjs');
  const delivery=read('account-recovery-delivery-v3.mjs');
  const runtime=read('production-v27.mjs');
  const hotfix=read('account-recovery-email-v2.mjs');
  const backend=read('account-recovery-v1.mjs');
  const frontend=read('account-recovery-v1.js');
  assert.equal(pkg.version,'2.14.2');
  assert.equal(pkg.scripts.start,'node production-v28.mjs');
  assert.match(deliveryRuntime,/await import\('\.\/production-v27\.mjs'\)/);
  assert.match(deliveryRuntime,/handleAccountRecoveryDeliveryV3Route/);
  assert.match(runtime,/await import\('\.\/production-v26\.mjs'\)/);
  assert.match(runtime,/handleAccountRecoveryEmailV2Route/);
  assert.match(hotfix,/role IN\('user','admin'\)/);
  assert.match(delivery,/LOWER\(u\.email\)=LOWER\(\$1\)/);
  assert.match(delivery,/verified_notification_email/);
  assert.match(delivery,/account_recovery_email_deliveries/);
  assert.match(delivery,/last_event/);
  assert.match(delivery,/https:\/\/api\.resend\.com\/emails\?limit=100/);
  assert.match(delivery,/ACCOUNT_RECOVERY_PROBE_TO/);
  assert.match(delivery,/account recovery request received/);
  assert.match(delivery,/account recovery delivery status/);
  assert.match(delivery,/revokeIssuedToken/);
  assert.match(backend,/crypto\.randomBytes\(32\)/);
  assert.match(backend,/aes-256-gcm/);
  assert.doesNotMatch(backend,/SELECT[^\n]*password_hash[^\n]*\/api\/account-recovery\/admin/i);
  assert.doesNotMatch(frontend,/ver senha|visualizar senha|senha atual do usuário/i);
});

test('frontend supports light and dark themes and administrative audit language',()=>{
  const css=read('account-recovery-v1.css');
  const js=read('account-recovery-v1.js');
  assert.match(css,/html\[data-theme="dark"\]/);
  assert.match(css,/html:not\(\[data-theme="dark"\]\)/);
  assert.match(js,/Esqueceu sua senha\?/);
  assert.match(js,/Recuperação assistida/);
  assert.match(js,/Senhas e hashes nunca são exibidos/);
  assert.match(js,/Aprovar link manual/);
});
