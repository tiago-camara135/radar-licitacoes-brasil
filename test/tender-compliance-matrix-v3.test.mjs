import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDetailedRequirementsV3,evaluateRequirementAgainstDocumentsV3 } from '../tender-compliance-matrix-v3.mjs';

test('v3 preserva exigencias distintas do mesmo tipo',()=>{
  const readiness={requirements:[
    {title:'Atestado de capacidade técnica para manutenção preventiva',mandatory:true,evidence:{quote:'apresentar atestado para manutenção preventiva'}},
    {title:'Atestado de capacidade técnica com quantitativo mínimo de 300 unidades',mandatory:true,evidence:{quote:'quantitativo mínimo de 300 unidades'}}
  ]};
  const rows=buildDetailedRequirementsV3(readiness,{});
  assert.equal(rows.length,2);
  assert.equal(rows[0].type,'atestado_tecnico');
  assert.equal(rows[1].type,'atestado_tecnico');
  assert.notEqual(rows[0].requirement_id,rows[1].requirement_id);
});

test('v3 compara todos os documentos candidatos e ordena o mais aderente',()=>{
  const req=buildDetailedRequirementsV3({requirements:[{title:'Atestado de capacidade técnica para manutenção preventiva e corretiva de ar-condicionado',mandatory:true,evidence:{quote:'manutenção preventiva e corretiva de ar-condicionado'}}]},{} )[0];
  const docs=[
    {id:1,doc_type:'atestado_tecnico',filename:'Atestado fraco.pdf',label:'Atestado fraco',mime_type:'application/pdf'},
    {id:2,doc_type:'atestado_tecnico',filename:'Atestado forte.pdf',label:'Atestado forte',mime_type:'application/pdf'}
  ];
  const texts=new Map([
    [1,'ATESTADO DE CAPACIDADE TÉCNICA. Prestou serviços gerais de apoio administrativo.'],
    [2,'ATESTADO DE CAPACIDADE TÉCNICA. A empresa executou manutenção preventiva e corretiva de aparelhos de ar-condicionado, climatização, condensadoras e evaporadoras.']
  ]);
  const out=evaluateRequirementAgainstDocumentsV3({requirement:req,documents:docs,documentTexts:texts,profile:{},referenceDate:'2026-11-10',objectText:'manutenção preventiva e corretiva de ar-condicionado'});
  assert.equal(out.candidate_documents.length,2);
  assert.equal(out.best_document.id,2);
  assert.ok(['apparently_compatible','partial_match'].includes(out.state));
});

test('v3 identifica quantitativo objetivo não comprovado',()=>{
  const req=buildDetailedRequirementsV3({requirements:[{title:'Atestado técnico com quantitativo mínimo de 300 unidades',mandatory:true,evidence:{quote:'quantitativo mínimo de 300 unidades'}}]},{} )[0];
  const docs=[{id:3,doc_type:'atestado_tecnico',filename:'Atestado 180.pdf',label:'Atestado 180',mime_type:'application/pdf'}];
  const texts=new Map([[3,'ATESTADO DE CAPACIDADE TÉCNICA. A empresa executou fornecimento e instalação de 180 unidades de equipamentos.']]);
  const out=evaluateRequirementAgainstDocumentsV3({requirement:req,documents:docs,documentTexts:texts,profile:{},referenceDate:'2026-11-10',objectText:'fornecimento e instalação de equipamentos'});
  const quantity=out.criteria.find(x=>x.code==='quantitative');
  assert.equal(quantity.status,'fail');
  assert.equal(out.state,'not_met');
});

test('v3 não trata exigência condicional ausente como bloqueador absoluto',()=>{
  const req=buildDetailedRequirementsV3({requirements:[{title:'Licença ambiental, quando aplicável ao objeto',mandatory:true,evidence:{quote:'licença ambiental quando aplicável'}}]},{} )[0];
  assert.equal(req.condition,'condicional');
  const out=evaluateRequirementAgainstDocumentsV3({requirement:req,documents:[],documentTexts:new Map(),profile:{},referenceDate:'2026-11-10',objectText:'serviços diversos'});
  assert.equal(out.state,'conditional_pending');
});

test('v3 separa fase de proposta e contratação',()=>{
  const rows=buildDetailedRequirementsV3({requirements:[
    {title:'Garantia de proposta deverá acompanhar a proposta comercial',evidence:{quote:'garantia de proposta'}},
    {title:'Certidão de regularidade perante o FGTS atualizada antes da assinatura do contrato',evidence:{quote:'FGTS antes da assinatura do contrato'}}
  ]},{});
  assert.equal(rows.length,2);
  assert.equal(rows[0].phase,'proposta');
  assert.equal(rows[1].phase,'contratacao');
});
