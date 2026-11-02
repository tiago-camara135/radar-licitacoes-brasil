import test from 'node:test';
import assert from 'node:assert/strict';
import { tenderDocumentPriority, parseTenderIntelligenceJson, normalizeTenderIntelligence } from '../tender-intelligence-v1.mjs';

test('prioriza edital, termo de referência e retificações',()=>{
  assert.ok(tenderDocumentPriority({titulo:'EDITAL Pregão Eletrônico'})>tenderDocumentPriority({titulo:'Aviso de licitação'}));
  assert.ok(tenderDocumentPriority({titulo:'Termo de Referência'})>tenderDocumentPriority({titulo:'Anexo genérico'}));
  assert.ok(tenderDocumentPriority({titulo:'Retificação do Edital'})>100);
});

test('parser aceita JSON puro e fenced JSON',()=>{
  assert.deepEqual(parseTenderIntelligenceJson('{"confidence":"high"}'),{confidence:'high'});
  assert.deepEqual(parseTenderIntelligenceJson('```json\n{"confidence":"medium"}\n```'),{confidence:'medium'});
});

test('normalização mantém apenas estrutura segura e evidência limitada',()=>{
  const x=normalizeTenderIntelligence({
    executive_summary:'Resumo',confidence:'high',
    tender_overview:{object:'Objeto',estimated_value:123.45},
    requirements:[{category:'Qualificação Técnica',title:'Atestado',requirement:'Apresentar atestado compatível',mandatory:true,risk_level:'high',evidence:{document_title:'Edital',section:'9.5',page:12,quote:'Trecho do edital'}}],
    critical_points:[{title:'Visita técnica',detail:'Obrigatória',risk_level:'critical',evidence:{document_title:'Edital',quote:'visita obrigatória'}}],
    deadlines:[{label:'Sessão',date:'2026-11-10 09:00',evidence:{document_title:'Edital',quote:'sessão em 10/11'}}],
    me_epp:{has_specific_rule:true,summary:'Regra específica'},guarantees:{required:false},samples_or_visit:{required:true,summary:'Visita exigida'},uncertainties:['Conferir anexo']
  });
  assert.equal(x.confidence,'high');
  assert.equal(x.tender_overview.estimated_value,123.45);
  assert.equal(x.requirements[0].evidence.page,12);
  assert.equal(x.requirements[0].risk_level,'high');
  assert.equal(x.critical_points[0].risk_level,'critical');
  assert.equal(x.samples_or_visit.required,true);
  assert.deepEqual(x.uncertainties,['Conferir anexo']);
});
