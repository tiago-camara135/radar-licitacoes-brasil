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
  assert.equal(d1.user.id,u1);assert.ok(Array.isArray(d1.recommendations));assert.ok(d1.recommendations.some(x=>x.pncp_id===pncpId),'matching alert must recommend the active procurement');
  assert.equal(d1.metrics.active_alerts,1);assert.equal(d1.tracking.length,0);assert.equal(d1.habilitation.missing,9);

  r=await get('/api/dashboard/overview',c2);assert.equal(r.status,200);const d2=await r.json();assert.equal(d2.user.id,u2);assert.equal(d2.recommendations.some(x=>x.pncp_id===pncpId),false,'second user must not inherit first user recommendation');

  r=await post('/api/dashboard/tracking',{cnpj,year,sequence,status:'preparando_documentacao'},c1);assert.equal(r.status,200);j=await r.json();assert.equal(j.ok,true);const trackingId=Number(j.item.id);
  r=await get('/api/dashboard/overview',c1);assert.equal(r.status,200);const tracked=await r.json();assert.ok(tracked.tracking.some(x=>Number(x.id)===trackingId));assert.equal(tracked.funnel.preparando_documentacao,1);
  r=await get('/api/dashboard/overview',c2);assert.equal(r.status,200);const isolated=await r.json();assert.equal(isolated.tracking.length,0,'tracking must be isolated by user_id');

  r=await post('/api/dashboard/tracking',{cnpj,year,sequence,status:'participando'},c1,'https://cross-origin.invalid');assert.equal(r.status,403,'cross-origin dashboard write must be blocked');

  r=await get('/assets/stability-ui-v1.js');assert.equal(r.status,200);assert.equal(r.headers.get('x-rlb-user-dashboard'),'v2');const js=await r.text();
  assert.match(js,/__rlbUserDashboardV2/);assert.match(js,/O que precisa da sua atenção/);assert.match(js,/Oportunidades para você/);assert.match(js,/Minha Operação/);assert.match(js,/Licitações acompanhadas/);assert.match(js,/\.slice\(0,3\)/);assert.doesNotMatch(js,/Escolha o que aparece no seu dashboard/);
  r=await get('/assets/user-dashboard-v2.css');assert.equal(r.status,200);assert.equal(r.headers.get('x-rlb-user-dashboard'),'v2');const css=await r.text();assert.match(css,/\.db-kpis/);assert.match(css,/\.op-grid/);assert.match(css,/html\[data-theme="dark"\]/);assert.match(css,/html:not\(\[data-theme="dark"\]\)/);

  r=await req('/api/dashboard/overview');assert.equal(r.status,401,'anonymous dashboard must be blocked');
  console.log('user dashboard v2 smoke passed: clean decision view, dedicated operation workspace, tracking, isolation, adaptive asset and origin guard verified');
}finally{
  await db.query('DELETE FROM monitored_procurements WHERE pncp_id=$1',[pncpId]).catch(()=>{});
  if(u1||u2)await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])',[[u1,u2].filter(Boolean)]).catch(()=>{});
  await db.end();
}
