import test from 'node:test';
import assert from 'node:assert/strict';
import { tenderDocumentPriorityV2, pickTenderDocsV2, parseTenderIntelligenceV2Json, normalizeTenderIntelligenceV2, verifyTenderEvidenceV2 } from '../tender-intelligence-v2.mjs';

test('V2 prioriza retificações, edital, TR e anexos técnicos relevantes',()=>{
  const docs=[
    {sequencialDocumento:1,titulo:'Aviso de licitação'},
    {sequencialDocumento:2,titulo:'Edital Pregão Eletrônico'},
    {sequencialDocumento:3,titulo:'Termo de Referência'},
    {sequencialDocumento:4,titulo:'Retificação do Edital'},
    {sequencialDocumento:5,titulo:'Planilha Orçamentária'}
  ];
  assert.ok(tenderDocumentPriorityV2(docs[3])>tenderDocumentPriorityV2(docs[1]));
  assert.ok(tenderDocumentPriorityV2(docs[1])>tenderDocumentPriorityV2(docs[0]));
  const picked=pickTenderDocsV2(docs);
  assert.equal(picked[0].sequencialDocumento,4);
  assert.ok(picked.some(x=>x.sequencialDocumento===2));
  assert.ok(picked.some(x=>x.sequencialDocumento===3));
  assert.ok(picked.some(x=>x.sequencialDocumento===5));
});

test('parser V2 aceita JSON puro e fenced JSON',()=>{
  assert.equal(parseTenderIntelligenceV2Json('{"confidence":"high"}').confidence,'high');
  assert.equal(parseTenderIntelligenceV2Json('```json\n{"confidence":"medium"}\n```').confidence,'medium');
});

test('normalização V2 preserva relatório detalhado e limita campos',()=>{
  const out=normalizeTenderIntelligenceV2({
    executive_summary:'Resumo',confidence:'high',
    tender_overview:{object:'Objeto',judgment_criterion:'Menor preço'},
    technical_qualification:{summary:'Atestado compatível',minimum_quantities:'50%'},
    economic_financial:{summary:'Balanço exigido',indices:'LG, SG e LC'},
    requirements:[{category:'Qualificação Técnica',title:'Atestado',requirement:'Apresentar atestado compatível',risk_level:'high',recommended_action:'Conferir quantitativos',evidence:{document_title:'Edital',quote:'Apresentar atestado compatível com o objeto'}}],
    human_review_checklist:['Conferir item 9']
  });
  assert.equal(out.report_version,'2.0-verified');
  assert.equal(out.confidence,'high');
  assert.equal(out.technical_qualification.minimum_quantities,'50%');
  assert.equal(out.economic_financial.indices,'LG, SG e LC');
  assert.equal(out.requirements[0].recommended_action,'Conferir quantitativos');
  assert.deepEqual(out.human_review_checklist,['Conferir item 9']);
});

test('validação de evidência confirma citação literal e sinaliza citação inexistente',()=>{
  const analysis=normalizeTenderIntelligenceV2({
    executive_summary:'Resumo',
    requirements:[
      {title:'Atestado',requirement:'Atestado exigido',evidence:{document_title:'Edital',quote:'A licitante deverá apresentar atestado de capacidade técnica'}},
      {title:'Garantia',requirement:'Garantia de 5%',evidence:{document_title:'Edital',quote:'Esta frase não existe no documento fornecido'}}
    ]
  });
  const text='EDITAL. A licitante deverá apresentar atestado de capacidade técnica compatível com o objeto. Fim.';
  const result=verifyTenderEvidenceV2(analysis,text);
  assert.equal(result.stats.verified,1);
  assert.equal(result.stats.rejected,1);
  assert.equal(result.analysis.requirements[0].evidence.verified,true);
  assert.equal(result.analysis.requirements[1].evidence.verified,false);
  assert.ok(result.analysis.uncertainties.some(x=>/não foram confirmadas/i.test(x)));
});
