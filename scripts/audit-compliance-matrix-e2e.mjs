import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';

const base='http://127.0.0.1:10000';
const origin=base;
const db=new Pool({connectionString:process.env.DATABASE_URL,ssl:false});
let cookie='';

async function req(path,{method='GET',body,timeout=30000}={}){
  const headers={accept:'application/json',origin};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.cookie=cookie;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  return{r,data};
}
async function wait(){for(let i=0;i<80;i++){try{const r=await fetch(base+'/api/health');if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,250))}throw new Error('server not ready')}
function makePdf(text){
  const esc=String(text).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  const stream=`BT\n/F1 11 Tf\n72 720 Td\n(${esc}) Tj\nET`;
  const objects=[`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n`,`4 0 obj\n<< /Length ${Buffer.byteLength(stream,'ascii')} >>\nstream\n${stream}\nendstream\nendobj\n`,`5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`];
  let out='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets[i+1]=Buffer.byteLength(out,'ascii');out+=objects[i]}const xref=Buffer.byteLength(out,'ascii');out+='xref\n0 6\n0000000000 65535 f \n';for(let i=1;i<=5;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,'ascii');
}
async function upload(type,label,text,expiry=null){const pdf=makePdf(text);const x=await req('/api/company-documents',{method:'POST',body:{doc_type:type,label,filename:`audit-${type}.pdf`,mime_type:'application/pdf',content_base64:pdf.toString('base64'),issue_date:'2026-10-20',expiry_date:expiry,issuer:'AUDITORIA CONTROLADA',notes:'E2E isolado'}});assert.equal(x.r.status,201,`upload ${type}: ${x.data?.error||x.r.status}`)}

await wait();
const email=`matrix-audit-${Date.now()}@example.test`,password=`Aa9!${crypto.randomUUID()}X`;
const reg=await req('/api/auth/register',{method:'POST',body:{email,password}});assert.equal(reg.r.status,201,reg.data?.error);
const me=await req('/api/me');assert.equal(me.r.status,200);const uid=me.data.user.id;assert.ok(uid);
const profile=await req('/api/company-documents/profile',{method:'PUT',body:{cnpj:'42720728000138',legal_name:'EMPRESA AUDITORIA RLB LTDA',trade_name:'RLB AUDITORIA',state:'RN',municipality:'Natal',contact_name:'Auditoria'}});assert.equal(profile.r.status,200,profile.data?.error);console.log('PROFILE=',JSON.stringify({cnpj:profile.data?.profile?.cnpj,legal_name:profile.data?.profile?.legal_name}));
await upload('fgts','Regularidade FGTS','CERTIFICADO DE REGULARIDADE DO FGTS FUNDO DE GARANTIA DO TEMPO DE SERVICO CNPJ 42.720.728/0001-38 EMPRESA AUDITORIA RLB LTDA','2027-02-01');
await upload('atestado_tecnico','Atestado de Capacidade Técnica','ATESTADO DE CAPACIDADE TECNICA. A EMPRESA AUDITORIA RLB LTDA CNPJ 42.720.728/0001-38 executou manutencao preventiva e corretiva de aparelhos de ar condicionado com fornecimento de pecas e servicos tecnicos.');

const key='18348094000150-2026-97';
const readiness={scope:'edital',procurement:{pncp_key:key,org_cnpj:'18348094000150',year:2026,sequence:97,reference_date:'2026-12-01',object_text:'manutencao preventiva e corretiva de aparelhos de ar condicionado',org_name:'MUNICIPIO TESTE',municipality:'Natal',uf:'RN'},requirements:[{type:'fgts',label:'Regularidade perante o FGTS',group:'Fiscal',mandatory:true,evidence:'Item 8.1 exige regularidade perante o FGTS.'},{type:'cndt',label:'Regularidade Trabalhista / CNDT',group:'Trabalhista',mandatory:true,evidence:'Item 8.2 exige CNDT.'},{type:'atestado_tecnico',label:'Atestado de Capacidade Técnica',group:'Técnica',mandatory:true,requirement:'Atestado compatível com manutencao preventiva e corretiva de aparelhos de ar condicionado',evidence:'Item 9.5 exige atestado compatível.'},{type:'declaracao',label:'Declaração exigida',group:'Declarações',mandatory:true,evidence:'Item 10 exige declaração específica.'}]};
const analysis={requirements:[{type:'fgts',title:'FGTS',requirement:'Certificado de regularidade do FGTS',evidence:{quote:'regularidade perante o FGTS',verified:true}},{type:'cndt',title:'CNDT',requirement:'Certidão negativa de débitos trabalhistas',evidence:{quote:'CNDT',verified:true}},{type:'atestado_tecnico',title:'Atestado técnico',requirement:'Atestado compatível com manutencao preventiva e corretiva de aparelhos de ar condicionado',evidence:{quote:'atestado compatível',verified:true}},{type:'declaracao',title:'Declaração',requirement:'Declaração específica para o certame',evidence:{quote:'declaração',verified:true}}]};
await db.query(`INSERT INTO tender_intelligence_analyses(user_id,pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,readiness,diagnostics,analyzed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT(user_id,pncp_key) DO UPDATE SET analysis=EXCLUDED.analysis,readiness=EXCLUDED.readiness,diagnostics=EXCLUDED.diagnostics,analyzed_at=NOW()`,[uid,key,'18348094000150',2026,97,'audit-controlled',analysis,[],readiness,{coverage_percent:100,verification_pass:true}]);
const mres=await req('/api/tender-compliance-matrix/analyze',{method:'POST',body:{cnpj:'18348094000150',year:2026,sequence:97},timeout:60000});assert.equal(mres.r.status,200,mres.data?.error);const m=mres.data.matrix;assert.ok(m);const by=Object.fromEntries(m.requirements.map(x=>[x.type,x]));
console.log('ITEMS=',JSON.stringify(m.requirements.map(x=>({type:x.type,state:x.state,confidence:x.confidence,identity:x.identity_confirmed,detail:x.detail,document_evidence:x.document_evidence,document:x.document?.filename}))));
console.log('SCORES=',JSON.stringify({readiness:m.readiness_score,confidence:m.confidence_score,level:m.confidence_level,counts:m.counts,pdfs:m.diagnostics.company_pdfs_parsed}));
assert.equal(by.fgts.state,'verified');assert.equal(by.fgts.confidence,97);assert.equal(by.cndt.state,'missing');assert.equal(by.cndt.confidence,98);assert.ok(['apparently_compatible','partial_match'].includes(by.atestado_tecnico.state));assert.equal(by.declaracao.state,'to_prepare');assert.equal(by.declaracao.confidence,95);assert.equal(m.readiness_score,54);assert.equal(m.confidence_score,95);assert.equal(m.confidence_level,'muito_alta');assert.equal(m.counts.blockers,1);assert.equal(m.counts.to_prepare,1);assert.ok(m.action_plan.length>=3);
console.log('CONTROLLED_MATRIX_E2E_SUCCESS=1');await db.end();
