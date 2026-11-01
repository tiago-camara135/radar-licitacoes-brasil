import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const origin=new URL(base).origin;
const email=`browser-ci-${Date.now()}@example.test`;
const password='CI-Strong-Pass-2026!';
let cookie='';

async function request(path,{method='GET',body,expected=200,requestOrigin=origin,auth=true}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(auth&&cookie)headers.cookie=cookie;
  if(['POST','PUT','PATCH','DELETE'].includes(method)&&requestOrigin)headers.origin=requestOrigin;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const setCookie=response.headers.get('set-cookie');
  if(setCookie)cookie=setCookie.split(';')[0];
  const text=await response.text();
  let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  assert.equal(response.status,expected,`${method} ${path}: ${response.status} ${text}`);
  return data;
}

for(let i=0;i<40;i++){
  try{await request('/api/health',{auth:false});break}catch(error){if(i===39)throw error;await new Promise(r=>setTimeout(r,500))}
}

const originHealth=await request('/api/security/origin-health',{auth:false});
assert.equal(originHealth.ok,true);
assert.equal(originHealth.guard,'v1');

const rejected=await request('/api/auth/register',{method:'POST',auth:false,expected:403,requestOrigin:'https://cross-origin.invalid',body:{email:`rejected-${Date.now()}@example.test`,password}});
assert.equal(rejected.code,'origin_not_authorized');

const registered=await request('/api/auth/register',{method:'POST',auth:false,expected:201,body:{email,password}});
assert.equal(registered.user.email,email);
const me=await request('/api/me');
assert.equal(me.user.email,email);

const profile=await request('/api/company-documents/profile',{method:'PUT',body:{legal_name:'Empresa Browser CI',state:'RN',municipality:'Natal',contact_name:'CI'}});
assert.equal(profile.profile.legal_name,'Empresa Browser CI');

const expiry=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
const pdf=Buffer.from('%PDF-1.4\n% RLB browser smoke\n%%EOF\n').toString('base64');
const uploaded=await request('/api/company-documents',{method:'POST',expected:201,body:{doc_type:'fgts',issuer:'Caixa CI',jurisdiction:'Federal',expiry_date:expiry,filename:'crf-fgts-ci.pdf',mime_type:'application/pdf',content_base64:pdf}});
assert.ok(uploaded.item.id);

const summary=await request('/api/company-documents/summary');
assert.ok(Number(summary.summary.total)>=1);

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
const stamp=Date.now();
const cnpj='12345678000199',year=2026,sequence=910000+Math.floor(Math.random()*80000),pncpId=`CI-READINESS-${stamp}`;
const closesAt=new Date(Date.now()+7*86400000);
const raw={numeroControlePNCP:pncpId,modalidadeId:6,modalidadeNome:'Pregão - Eletrônico',objetoCompra:'CI prontidão documental',orgaoEntidade:{cnpj,razaoSocial:'MUNICIPIO TESTE CI'},unidadeOrgao:{municipioNome:'Natal',ufSigla:'RN'},anoCompra:year,sequencialCompra:sequence,dataPublicacaoPncp:new Date().toISOString(),dataEncerramentoProposta:closesAt.toISOString(),valorTotalEstimado:1000};
await pool.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,raw,detected_at,last_seen_at) VALUES($1,$2,$3,$4,6,$5,$6,$7,$8,'RN',1000,NOW(),$9,$10,$11,NOW(),NOW())`,[pncpId,cnpj,year,sequence,raw.modalidadeNome,raw.objetoCompra,raw.orgaoEntidade.razaoSocial,raw.unidadeOrgao.municipioNome,closesAt,`https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequence}`,JSON.stringify(raw)]);

const quick=await request('/api/tender-readiness-quick/score',{method:'POST',body:{items:[{cnpj,year,sequence}]}});
assert.equal(quick.items.length,1);
assert.equal(quick.items[0].key,`${cnpj}-${year}-${sequence}`);
assert.ok(Number.isFinite(Number(quick.items[0].score)));

const fullValidation=await request('/api/tender-readiness/analyze',{method:'POST',expected:400,body:{cnpj:'123',year,sequence}});
assert.notEqual(fullValidation.code,'origin_not_authorized');

await pool.query('DELETE FROM monitored_procurements WHERE pncp_id=$1',[pncpId]);
await pool.end();

await request('/api/auth/logout',{method:'POST',body:{}});
console.log('browser-origin smoke: origin guard, company documents and readiness routes passed');
