import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';

const base='http://127.0.0.1:10000',origin=base;
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
const suffix=crypto.randomBytes(5).toString('hex');
const email1=`dashboard-a-${suffix}@example.com`,email2=`dashboard-b-${suffix}@example.com`,password='DashboardPassword!123';
const cnpj='12345678000195',year=2026,sequence=Number('8'+String(Date.now()).slice(-6)),pncpId=`dashboard-test-${suffix}`;
let u1=null,u2=null,c1='',c2='';
async function req(path,opt={}){return fetch(base+path,{redirect:'manual',...opt})}
async function wait(){for(let i=0;i<60;i++){try{const r=await req('/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('Servidor não ficou pronto')}
function cookie(r){return String(r.headers.get('set-cookie')||'').split(';')[0]}
async function post(path,body,c='',requestOrigin=origin){return req(path,{method:'POST',headers:{'content-type':'application/json',origin:requestOrigin,...(c?{cookie:c}:{})},body:JSON.stringify(body)})}
async function get(path,c=''){return req(path,{headers:{...(c?{cookie:c}:{}),accept:'application/json'}})}

await wait();
try{
  let r=await post('/api/auth/register',{email:email1,password});assert.equal(r.status,201);let j=await r.json();u1=j.user.id;c1=cookie(r);
  r=await post('/api/auth/register',{email:email2,password});assert.equal(r.status,201);j=await r.json();u2=j.user.id;c2=cookie(r);
  r=await post('/api/alerts',{name:'Combustíveis RN',keyword:'combustível',uf:'RN',enabled:true},c1);assert.equal(r.status,201);

  await db.query(`INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,origin_url,raw,detected_at,last_seen_at)
    VALUES($1,$2,$3,$4,6,'Pregão - Eletrônico','Aquisição de combustível para abastecimento da frota municipal','Prefeitura Municipal de Teste','Natal','RN',150000,NOW(),NOW()+INTERVAL '5 days',$5,$6,$7::jsonb,NOW(),NOW())`,[pncpId,cnpj,year,sequence,`https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequence}`,'https://example.test/processo',JSON.stringify({numeroControlePNCP:pncpId})]);

  r=await get('/api/dashboard/overview',c1);assert.equal(r.status,200);const d1=await r.json();
  assert.equal(d1.user.id,u1);assert.ok(d1.recommendations.some(x=>x.pncp_id===pncpId));assert.equal(d1.metrics.active_alerts,1);

  r=await post('/api/dashboard/preferences',{geo:{scope:'ufs',ufs:['RN']}},c1);assert.equal(r.status,200);
  r=await get('/api/dashboard/overview',c1);assert.equal(r.status,200);const rn=await r.json();assert.ok(rn.recommendations.some(x=>x.pncp_id===pncpId));

  r=await get('/api/dashboard/overview',c2);assert.equal(r.status,200);const d2=await r.json();assert.equal(d2.recommendations.some(x=>x.pncp_id===pncpId),false);

  r=await post('/api/dashboard/tracking',{cnpj,year,sequence,status:'participando'},c1);assert.equal(r.status,200);j=await r.json();assert.equal(j.ok,true);
  r=await get('/api/dashboard/overview',c1);assert.equal(r.status,200);const tracked=await r.json();assert.equal(tracked.funnel.participando,1);
  r=await get('/api/dashboard/overview',c2);assert.equal(r.status,200);const isolated=await r.json();assert.equal(isolated.tracking.length,0);

  r=await post('/api/dashboard/tracking',{cnpj,year,sequence,status:'participando'},c1,'https://cross-origin.invalid');assert.equal(r.status,403);

  r=await get('/assets/stability-ui-v1.js');assert.equal(r.status,200);const js=await r.text();
  assert.doesNotMatch(js,/__rlbUserDashboardV2/);
  assert.doesNotMatch(js,/Minha Operação/);
  assert.doesNotMatch(js,/Oportunidades para você/);

  r=await req('/api/dashboard/overview');assert.equal(r.status,401);
  console.log('backend dashboard smoke passed: APIs preserved, isolation/origin guard valid, visual Dashboard and Minha Operação absent');
}finally{
  await db.query('DELETE FROM monitored_procurements WHERE pncp_id=$1',[pncpId]).catch(()=>{});
  if(u1||u2)await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])',[[u1,u2].filter(Boolean)]).catch(()=>{});
  await db.end();
}
