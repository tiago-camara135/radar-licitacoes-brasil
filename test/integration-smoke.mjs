import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const email=`ci-${Date.now()}@example.test`,password='CI-Strong-Pass-2026!';
let cookie='';

async function call(path,{method='GET',body,expected=200,auth=true}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(auth&&cookie)headers.cookie=cookie;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  assert.equal(r.status,expected,`${method} ${path}: expected ${expected}, got ${r.status}: ${text}`);
  return data;
}

for(let i=0;i<40;i++){
  try{await call('/api/health',{auth:false});break}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,500))}
}

const reg=await call('/api/auth/register',{method:'POST',auth:false,expected:201,body:{email,password}});
assert.equal(reg.user.email,email);
const me=await call('/api/me');assert.equal(me.user.email,email);

const entitlement=await call('/api/entitlements');
assert.equal(entitlement.entitlement.active,true);
assert.equal(entitlement.entitlement.limits.alerts,20);

const alert=await call('/api/alerts',{method:'POST',expected:201,body:{name:'CI Combustíveis RN',keyword:'combustível',uf:'RN',modality_code:6,enabled:true}});
assert.ok(alert.item.id);
const alerts=await call('/api/alerts');
assert.equal(alerts.items.length,1);
assert.equal(alerts.items[0].name,'CI Combustíveis RN');

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
const stamp=Date.now();
const activeId=`CI-ACTIVE-${stamp}`,expiredId=`CI-EXPIRED-${stamp}`;
const now=new Date(),future=new Date(now.getTime()+7*86400000),past=new Date(now.getTime()-86400000);
const rawBase={modalidadeId:6,modalidadeNome:'Pregão - Eletrônico',objetoCompra:'CI Busca Ativa Combustível',orgaoEntidade:{cnpj:'12345678000199',razaoSocial:'MUNICIPIO TESTE CI'},unidadeOrgao:{municipioNome:'Natal',ufSigla:'RN'},dataPublicacaoPncp:now.toISOString(),valorTotalEstimado:1000};
for(const [id,end] of [[activeId,future],[expiredId,past]]){
  const raw={...rawBase,numeroControlePNCP:id,dataEncerramentoProposta:end.toISOString()};
  await pool.query(`INSERT INTO monitored_procurements(pncp_id,modality_code,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,raw,detected_at,last_seen_at) VALUES($1,6,$2,$3,$4,$5,'RN',1000,$6,$7,$8,$9,NOW(),NOW()) ON CONFLICT(pncp_id) DO NOTHING`,[id,raw.modalidadeNome,raw.objetoCompra,raw.orgaoEntidade.razaoSocial,raw.unidadeOrgao.municipioNome,now,end,`https://pncp.gov.br/app/editais/12345678000199/2026/1`,JSON.stringify(raw)]);
}
const searchStarted=Date.now();
const search=await call('/api/licitacoes?keyword=CI%20Busca%20Ativa&uf=RN&modalidade=6&days=0');
const searchMs=Date.now()-searchStarted;
assert.equal(search.active_only,true);
assert.equal(search.strategy,'active-local-first');
assert.ok(searchMs<3000,`local-first search took ${searchMs}ms`);
assert.ok(search.items.some(x=>x.numeroControlePNCP===activeId),'active opportunity must be returned');
assert.equal(search.items.some(x=>x.numeroControlePNCP===expiredId),false,'expired opportunity must never be returned');
await pool.query('DELETE FROM monitored_procurements WHERE pncp_id=ANY($1::text[])',[[activeId,expiredId]]);
await pool.end();

const fakePdf=Buffer.from('not-a-real-pdf').toString('base64');
const badUpload=await call('/api/company-documents',{method:'POST',expected:400,body:{doc_type:'federal',filename:'certidao.pdf',mime_type:'application/pdf',content_base64:fakePdf}});
assert.equal(badUpload.code,'invalid_upload_signature');

const status=await call('/api/search-status');
assert.equal(status.status?.ok,true);
assert.equal(status.status?.active_only,true);
assert.equal(status.status?.search_strategy,'active-local-first');

await call('/api/auth/logout',{method:'POST',body:{}});
console.log(`integration smoke: authenticated core flows passed; active-only search ${searchMs}ms`);
