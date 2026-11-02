import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyRequirementV2,evaluateMatrixItemV2,calculateMatrixScoresV2,buildActionPlanV2} from '../tender-compliance-matrix-v2.mjs';

const profile={cnpj:'42720728000138',legal_name:'TIAGO VARELA DA CAMARA'};
const ref='2026-11-10';

test('classifica exigências típicas de habilitação e providências',()=>{
  assert.equal(classifyRequirementV2({title:'Certificado de regularidade do FGTS'}),'fgts');
  assert.equal(classifyRequirementV2({requirement:'Apresentar atestado de capacidade técnica compatível'}),'atestado_tecnico');
  assert.equal(classifyRequirementV2({title:'Garantia de proposta equivalente a 1%'}),'garantia_proposta');
});

test('documento fiscal com conteúdo, identidade e validade é validado com alta confiança',()=>{
  const item=evaluateMatrixItemV2({requirement:{type:'fgts',evidence:'edital exige FGTS'},doc:{doc_type:'fgts',expiry_date:'2026-12-20'},docText:'CERTIFICADO DE REGULARIDADE DO FGTS CNPJ 42.720.728/0001-38 TIAGO VARELA DA CAMARA Fundo de Garantia do Tempo de Serviço',profile,referenceDate:ref});
  assert.equal(item.state,'verified');assert.ok(item.confidence>=95);assert.equal(item.identity_confirmed,true);
});

test('documento vencido é bloqueador objetivo e falta vira pendência de alta confiança',()=>{
  const expired=evaluateMatrixItemV2({requirement:{type:'fgts',evidence:'edital exige FGTS'},doc:{doc_type:'fgts',expiry_date:'2026-11-01'},docText:'FGTS 42.720.728/0001-38',profile,referenceDate:ref});
  const missing=evaluateMatrixItemV2({requirement:{type:'cndt',evidence:'edital exige CNDT'},doc:null,profile,referenceDate:ref});
  assert.equal(expired.state,'expired_at_reference');assert.equal(missing.state,'missing');assert.ok(missing.confidence>=90);
});

test('documento técnico nunca recebe aptidão absoluta; usa compatibilidade aparente/parcial',()=>{
  const item=evaluateMatrixItemV2({requirement:{type:'atestado_tecnico',requirement:'Atestado de capacidade técnica para manutenção preventiva de ar condicionado'},doc:{doc_type:'atestado_tecnico',expiry_date:null},docText:'ATESTADO DE CAPACIDADE TÉCNICA. A empresa realizou manutenção preventiva e corretiva de equipamentos de ar condicionado com fornecimento de peças.',profile,referenceDate:ref,objectText:'manutenção preventiva e corretiva de aparelhos de ar condicionado'});
  assert.ok(['apparently_compatible','partial_match'].includes(item.state));assert.ok(item.confidence<95);
});

test('declaração específica ausente é classificada como a providenciar e plano de ação é gerado',()=>{
  const item=evaluateMatrixItemV2({requirement:{type:'declaracao',evidence:'declaração exigida'},doc:null,profile,referenceDate:ref});
  assert.equal(item.state,'to_prepare');
  const plan=buildActionPlanV2([{...item,label:'Declaração'}]);assert.equal(plan[0].priority,'providenciar');
});

test('confiabilidade é independente da prontidão e cai quando a fonte é preliminar',()=>{
  const items=[{state:'verified',readiness_weight:1,confidence:97},{state:'missing',readiness_weight:0,confidence:98}];
  const good=calculateMatrixScoresV2(items,{scope:'edital',coverage:100,verificationPass:true,profilePresent:true});
  const preliminary=calculateMatrixScoresV2(items,{scope:'checklist_preliminar',coverage:60,verificationPass:false,profilePresent:false});
  assert.equal(good.readiness_score,50);assert.ok(good.confidence_score>=95);assert.ok(preliminary.confidence_score<good.confidence_score);
});
