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

test('runtime preserves recovery chain and exposes administrative delivery history safely',()=>{
  const pkg=JSON.parse(read('package.json'));
  const dashboardV2Runtime=read('production-v31.mjs');
  const dashboardRuntime=read('production-v30.mjs');
  const historyRuntime=read('production-v29.mjs');
  const historyBackend=read('account-recovery-admin-history-v1.mjs');
  const historyFrontend=read('account-recovery-admin-history-v1.js');
  const historyCss=read('account-recovery-admin-history-v1.css');
  const deliveryRuntime=read('production-v28.mjs');
  const delivery=read('account-recovery-delivery-v3.mjs');
  const runtime=read('production-v27.mjs');
  const hotfix=read('account-recovery-email-v2.mjs');
  const backend=read('account-recovery-v1.mjs');
  const frontend=read('account-recovery-v1.js');
  assert.equal(pkg.version,'2.17.0');
  assert.equal(pkg.scripts.start,'node production-v31.mjs');
  assert.match(dashboardV2Runtime,/await import\('\.\/production-v30\.mjs'\)/);
  assert.match(dashboardRuntime,/await import\('\.\/production-v29\.mjs'\)/);
  assert.match(historyRuntime,/await import\('\.\/production-v28\.mjs'\)/);
  assert.match(historyRuntime,/handleAccountRecoveryAdminHistoryRoute/);
  assert.match(historyRuntime,/X-RLB-Recovery-History/);
  assert.match(historyBackend,/account_recovery_email_deliveries/);
  assert.match(historyBackend,/providerCapability/);
  assert.match(historyBackend,/user\.password_reset_completed/);
  assert.match(historyBackend,/admin\.account_recovery_provider_refresh/);
  assert.match(historyFrontend,/Histórico de recuperação/);
  assert.match(historyFrontend,/Consultar Resend/);
  assert.match(historyFrontend,/Aceito pelo Resend/);
  assert.match(historyFrontend,/data-rh-tab/);
  assert.match(historyFrontend,/\.acc-nav/);
  assert.match(historyFrontend,/#accPanel/);
  assert.match(historyFrontend,/Recuperações/);
  assert.doesNotMatch(historyFrontend,/view\.appendChild\(/,'history must not be appended outside the native Admin shell');
  assert.match(historyCss,/html:not\(\[data-theme="dark"\]\)/);
  assert.match(historyCss,/html\[data-theme="dark"\]/);
  assert.match(deliveryRuntime,/await import\('\.\/production-v27\.mjs'\)/);
  assert.match(deliveryRuntime,/handleAccountRecoveryDeliveryV3Route/);
  assert.match(runtime,/await import\('\.\/production-v26\.mjs'\)/);
  assert.match(runtime,/handleAccountRecoveryEmailV2Route/);
  assert.match(hotfix,/role IN\('user','admin'\)/);
  assert.match(delivery,/verified_notification_email/);
  assert.match(delivery,/account_recovery_email_deliveries/);
  assert.match(delivery,/last_event/);
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
