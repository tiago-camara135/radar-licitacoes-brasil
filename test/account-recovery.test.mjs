import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hashAccountPassword,verifyAccountPassword,validateRecoveryDocumentSignature} from '../account-recovery-v1.mjs';
import {hashRecoveryPassword,verifyRecoveryPassword} from '../account-recovery-email-v2.mjs';

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

test('runtime preserves production chain and email hotfix supports user and admin',()=>{
  const pkg=JSON.parse(read('package.json'));
  const runtime=read('production-v27.mjs');
  const hotfix=read('account-recovery-email-v2.mjs');
  const backend=read('account-recovery-v1.mjs');
  const frontend=read('account-recovery-v1.js');
  assert.equal(pkg.version,'2.14.1');
  assert.equal(pkg.scripts.start,'node production-v27.mjs');
  assert.match(runtime,/await import\('\.\/production-v26\.mjs'\)/);
  assert.match(runtime,/handleAccountRecoveryEmailV2Route/);
  assert.match(hotfix,/role IN\('user','admin'\)/);
  assert.match(hotfix,/allowedRole=role=>role==='user'\|\|role==='admin'/);
  assert.match(hotfix,/account recovery email accepted/);
  assert.match(hotfix,/revokeIssuedToken/);
  assert.match(hotfix,/password_reset_delivery_failed/);
  assert.match(hotfix,/ACCOUNT_RECOVERY_EMAIL_TEST_MODE/);
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
