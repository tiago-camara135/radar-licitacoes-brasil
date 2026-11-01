import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const origin=new URL(base).origin;
const password='CI-Secondary-Pass-2026!';
const stamp=Date.now();
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});

function session(){return{cookie:''}}
async function req(s,path,{method='GET',body,expected=200,raw=false}={}){
  const headers={accept:raw?'*/*':'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(s?.cookie)headers.cookie=s.cookie;
  if(['POST','PUT','PATCH','DELETE'].includes(method))headers.origin=origin;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get('set-cookie');if(s&&set)s.cookie=set.split(';')[0];
  const buf=Buffer.from(await r.arrayBuffer());
  const text=buf.toString('utf8');
  assert.equal(r.status,expected,`${method} ${path}: expected ${expected}, got ${r.status}: ${text.slice(0,500)}`);
  if(raw)return{response:r,buf,text};
  let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}return data;
}

for(let i=0;i<40;i++){try{await req(null,'/api/health');break}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,500))}}

const a=session(),b=session();
const emailA=`audit-admin-${stamp}@example.test`,emailB=`audit-user-${stamp}@example.test`;
await req(a,'/api/auth/register',{method:'POST',expected:201,body:{email:emailA,password}});
await req(b,'/api/auth/register',{method:'POST',expected:201,body:{email:emailB,password}});

// Login explícito após logout.
await req(a,'/api/auth/logout',{method:'POST',body:{}});a.cookie='';
const loginA=await req(a,'/api/auth/login',{method:'POST',body:{email:emailA,password}});
assert.equal(loginA.user.email,emailA);
const loginB=await req(b,'/api/me');assert.equal(loginB.user.email,emailB);

// Alertas: criar, editar, isolamento entre usuários, configurações de canais e excluir.
const alert=await req(a,'/api/alerts',{method:'POST',expected:201,body:{name:'Auditoria RN',keyword:'combustível',uf:'RN',modality_code:6,enabled:true}});
const alertId=Number(alert.item.id);assert.ok(alertId>0);
const patched=await req(a,`/api/alerts/${alertId}`,{method:'PATCH',body:{name:'Auditoria RN atualizada',enabled:false}});
assert.equal(patched.item.name,'Auditoria RN atualizada');assert.equal(patched.item.enabled,false);
await req(b,`/api/alerts/${alertId}`,{method:'PATCH',expected:404,body:{name:'Não pode'}});
const nprof=await req(a,'/api/notifications/profile');assert.equal(typeof nprof.providers,'object');
const ntoggle=await req(a,'/api/notifications/profile',{method:'PUT',body:{email_enabled:false,whatsapp_enabled:false}});
assert.equal(ntoggle.profile.email_enabled,false);assert.equal(ntoggle.profile.whatsapp_enabled,false);
const aset=await req(a,`/api/notifications/alerts/${alertId}`,{method:'PUT',body:{region:'NORDESTE',onsite_enabled:true,email_enabled:false,whatsapp_enabled:false}});
assert.equal(aset.item.region,'NORDESTE');
assert.equal(aset.item.email_enabled,false);

// Habilitação: perfil, upload, patch, download, histórico, substituição e isolamento.
const profile=await req(a,'/api/company-documents/profile',{method:'PUT',body:{cnpj:'11222333000181',legal_name:'Empresa Auditoria LTDA',trade_name:'Auditoria',state:'RN',municipality:'Natal',contact_name:'Teste'}});
assert.equal(profile.profile.legal_name,'Empresa Auditoria LTDA');
const expiry1=new Date(Date.now()+60*86400000).toISOString().slice(0,10);
const expiry2=new Date(Date.now()+120*86400000).toISOString().slice(0,10);
const pdf1=Buffer.from('%PDF-1.4\n% auditoria 1\n1 0 obj\n<<>>\nendobj\n%%EOF\n').toString('base64');
const pdf2=Buffer.from('%PDF-1.4\n% auditoria 2\n1 0 obj\n<<>>\nendobj\n%%EOF\n').toString('base64');
const up1=await req(a,'/api/company-documents',{method:'POST',expected:201,body:{doc_type:'fgts',issuer:'Caixa',jurisdiction:'Federal',expiry_date:expiry1,filename:'fgts-audit-1.pdf',mime_type:'application/pdf',content_base64:pdf1}});
const doc1=Number(up1.item.id);assert.ok(doc1>0);
const upd=await req(a,`/api/company-documents/${doc1}`,{method:'PATCH',body:{notes:'validado na auditoria',expiry_date:expiry2}});
assert.equal(upd.item.notes,'validado na auditoria');assert.equal(upd.item.expiry_date,expiry2);
const dl=await req(a,`/api/company-documents/${doc1}/download`,{raw:true});
assert.ok(dl.buf.subarray(0,5).toString('ascii')==='%PDF-');
await req(b,`/api/company-documents/${doc1}/download`,{expected:404,raw:true});
const up2=await req(a,'/api/company-documents',{method:'POST',expected:201,body:{doc_type:'fgts',issuer:'Caixa Nova',jurisdiction:'Federal',expiry_date:expiry2,filename:'fgts-audit-2.pdf',mime_type:'application/pdf',content_base64:pdf2}});
const doc2=Number(up2.item.id);assert.ok(doc2>doc1);
const current=await req(a,'/api/company-documents');assert.equal(current.items.filter(x=>x.doc_type==='fgts').length,1);assert.equal(Number(current.items.find(x=>x.doc_type==='fgts').id),doc2);
const history=await req(a,'/api/company-documents?history=1');assert.ok(history.items.some(x=>Number(x.id)===doc1&&x.is_current===false));assert.ok(history.items.some(x=>Number(x.id)===doc2&&x.is_current===true));
const summary=await req(a,'/api/company-documents/summary');assert.ok(Number(summary.summary.total)>=1);assert.ok(Number.isFinite(Number(summary.summary.coverage)));

// Promove A a admin somente no banco descartável e valida autorização/central administrativa.
const userA=(await pool.query('SELECT id FROM users WHERE email=$1',[emailA])).rows[0];
const userB=(await pool.query('SELECT id FROM users WHERE email=$1',[emailB])).rows[0];
await pool.query("UPDATE users SET role='admin' WHERE id=$1",[userA.id]);
const adminUsers=await req(a,'/api/admin/users');assert.ok(adminUsers.items.some(x=>x.email===emailB));
const adminStats=await req(a,'/api/admin/stats');assert.ok(Number(adminStats.stats.users.total)>=2);
await req(b,'/api/admin/users',{expected:403});
const support=await req(a,`/api/admin-support/users/${userB.id}`);assert.equal(Number(support.data.user.id),Number(userB.id));
const supportCompany=await req(a,`/api/admin-support/users/${userB.id}/company`,{method:'PATCH',body:{legal_name:'Empresa B auditada',state:'RN'}});assert.equal(supportCompany.item.legal_name,'Empresa B auditada');

// Revogação de sessões de outro usuário deve encerrar a sessão-alvo.
const revoke=await req(a,`/api/admin-support/users/${userB.id}/sessions/revoke`,{method:'POST',body:{}});assert.equal(revoke.ok,true);assert.ok(Number(revoke.sessions)>=1);
await req(b,'/api/me',{expected:401});

// Limpeza e exclusões no usuário A.
await req(a,`/api/company-documents/${doc2}`,{method:'DELETE',body:{}});
const afterDelete=await req(a,'/api/company-documents');assert.equal(afterDelete.items.some(x=>Number(x.id)===doc2),false);
await req(a,`/api/alerts/${alertId}`,{method:'DELETE',body:{}});
const alertsAfter=await req(a,'/api/alerts');assert.equal(alertsAfter.items.some(x=>Number(x.id)===alertId),false);

// As operações administrativas e CRUD devem gerar trilha de auditoria.
const audit=await req(a,'/api/admin/audit');assert.ok(audit.items.length>0);

await pool.end();
console.log('secondary flows smoke: explicit login, CRUD/isolation, Habilitação history/download, notification settings and admin support passed');
