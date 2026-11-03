import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const origin=new URL(base).origin;
const email=`matrix-v3-ci-${Date.now()}@example.test`;
const password='CI-Matrix-V3-Strong-2026!';
let cookie='';

async function request(path,{method='GET',body,expected=200,auth=true}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(auth&&cookie)headers.cookie=cookie;
  if(['POST','PUT','PATCH','DELETE'].includes(method))headers.origin=origin;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}};
  assert.equal(response.status,expected,`${method} ${path}: ${response.status} ${text}`);return data;
}
function pdfEscape(v){return String(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')}
function makePdf(lines){
  const content=['BT','/F1 10 Tf','50 760 Td',...lines.flatMap((line,i)=>i===0?[`(${pdfEscape(line)}) Tj`]:['0 -16 Td',`(${pdfEscape(line)}) Tj`]),'ET'].join('\n');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf='%PDF-1.4\n',offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=objects.length;i++)pdf+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

for(let i=0;i<40;i++){try{await request('/api/health',{auth:false});break}catch(error){if(i===39)throw error;await new Promise(r=>setTimeout(r,350))}}
const registered=await request('/api/auth/register',{method:'POST',auth:false,expected:201,body:{email,password}});
const userId=Number(registered.user.id);assert.ok(userId>0);
await request('/api/company-documents/profile',{method:'PUT',body:{legal_name:'EMPRESA MATRIZ V3 LTDA',state:'RN',municipality:'Natal',contact_name:'CI'}});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
const companyCnpj='11222333000144';
await pool.query('UPDATE company_profiles SET cnpj=$2,legal_name=$3 WHERE user_id=$1',[userId,companyCnpj,'EMPRESA MATRIZ V3 LTDA']);

const fgts=makePdf(['CERTIFICADO DE REGULARIDADE DO FGTS','EMPRESA MATRIZ V3 LTDA','CNPJ 11.222.333/0001-44','Situacao REGULAR','Validade 31/12/2027']);
const atestado=makePdf(['ATESTADO DE CAPACIDADE TECNICA','EMPRESA MATRIZ V3 LTDA CNPJ 11.222.333/0001-44','Executou manutencao preventiva e corretiva de aparelhos de ar condicionado e climatizacao','Quantidade executada 180 unidades']);
await request('/api/company-documents',{method:'POST',expected:201,body:{doc_type:'fgts',issuer:'CAIXA',jurisdiction:'Federal',expiry_date:'2027-12-31',filename:'fgts-matriz-v3.pdf',mime_type:'application/pdf',content_base64:fgts.toString('base64')}});
await request('/api/company-documents',{method:'POST',expected:201,body:{doc_type:'atestado_tecnico',issuer:'Cliente Teste',jurisdiction:'RN',filename:'atestado-180-unidades.pdf',mime_type:'application/pdf',content_base64:atestado.toString('base64')}});

const tenderCnpj='12345678000199',year=2026,sequence=991111,pncpKey=`${tenderCnpj}-${year}-${sequence}`;
const requirements=[
  {title:'Regularidade perante o FGTS',mandatory:true,evidence:{verified:true,page:20,quote:'Apresentar comprovacao de regularidade perante o FGTS.'}},
  {title:'Atestado de capacidade tecnica para manutencao preventiva e corretiva de ar condicionado',mandatory:true,evidence:{verified:true,page:24,quote:'Comprovar experiencia em manutencao preventiva e corretiva de ar condicionado.'}},
  {title:'Atestado de capacidade tecnica com quantitativo minimo de 300 unidades',mandatory:true,evidence:{verified:true,page:24,quote:'Comprovar quantitativo minimo de 300 unidades.'}},
  {title:'Licenca ambiental, quando aplicavel ao objeto',mandatory:true,evidence:{verified:true,page:25,quote:'Apresentar licenca ambiental quando aplicavel.'}},
  {title:'Declaracao de proposta independente devera acompanhar a proposta comercial',mandatory:true,evidence:{verified:true,page:12,quote:'Declaracao de proposta independente devera acompanhar a proposta comercial.'}}
];
const readiness={scope:'edital',procurement:{reference_date:'2026-11-15',closes_at:'2026-11-15',object_text:'manutencao preventiva e corretiva de aparelhos de ar condicionado'},requirements};
const analysis={tender_overview:{object:'manutencao preventiva e corretiva de aparelhos de ar condicionado'},requirements:[]};
await pool.query(`INSERT INTO tender_intelligence_analyses(user_id,pncp_key,org_cnpj,year,sequence,model,analysis,source_documents,readiness,diagnostics,analyzed_at) VALUES($1,$2,$3,$4,$5,'ci-matrix-v3',$6,'[]'::jsonb,$7,$8,NOW()) ON CONFLICT(user_id,pncp_key) DO UPDATE SET analysis=EXCLUDED.analysis,readiness=EXCLUDED.readiness,diagnostics=EXCLUDED.diagnostics,analyzed_at=NOW()`,[userId,pncpKey,tenderCnpj,year,sequence,JSON.stringify(analysis),JSON.stringify(readiness),JSON.stringify({coverage_percent:100,verification_pass:true})]);

const result=await request('/api/tender-compliance-matrix/analyze',{method:'POST',body:{cnpj:tenderCnpj,year,sequence}});
const m=result.matrix;assert.equal(m.version,'3.0');assert.equal(m.requirements.length,5);assert.equal(m.document_summary.total,2);assert.equal(m.document_summary.used,2);
const fgtsReq=m.requirements.find(x=>x.type==='fgts');assert.ok(fgtsReq);assert.equal(fgtsReq.state,'verified');assert.ok(fgtsReq.confidence>=90);
const tech=m.requirements.filter(x=>x.type==='atestado_tecnico');assert.equal(tech.length,2);assert.ok(tech.every(x=>x.candidate_documents.length===1));
const quantitative=tech.find(x=>x.requirement.includes('300'));assert.ok(quantitative);assert.equal(quantitative.state,'not_met');assert.equal(quantitative.criteria.find(x=>x.code==='quantitative').status,'fail');
const conditional=m.requirements.find(x=>x.type==='licenca');assert.equal(conditional.condition,'condicional');assert.equal(conditional.state,'conditional_pending');
const declaration=m.requirements.find(x=>x.type==='declaracao');assert.equal(declaration.phase,'proposta');assert.equal(declaration.state,'to_prepare');
assert.ok(m.counts.blockers>=1);assert.ok(m.action_plan.some(x=>x.requirement_id===quantitative.requirement_id&&x.priority===1));
assert.ok(m.phase_scores.habilitacao.total>=3);assert.ok(m.phase_scores.proposta.total>=1);
assert.match(m.verdict.label,/regulariza|risco|revis/i);

await pool.query('DELETE FROM tender_compliance_matrices WHERE user_id=$1',[userId]);
await pool.query('DELETE FROM tender_intelligence_analyses WHERE user_id=$1',[userId]);
await pool.query('DELETE FROM company_documents WHERE user_id=$1',[userId]);
await pool.query('DELETE FROM company_profiles WHERE user_id=$1',[userId]);
await pool.query('DELETE FROM users WHERE id=$1',[userId]);
await pool.end();
console.log(`tender compliance v3 smoke passed: readiness=${m.readiness_score}% confidence=${m.confidence_score}% blockers=${m.counts.blockers}`);
