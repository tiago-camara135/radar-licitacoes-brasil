import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileTenderAuthoritativeData } from '../tender-intelligence-precision-v1.mjs';
import { detectRequirements } from '../tender-readiness-v1.mjs';

test('PNCP zero/ausente impede valor sugerido pela IA de virar valor oficial',()=>{
  const result=reconcileTenderAuthoritativeData({
    procurement:{pncp_key:'x',estimated_value:0,object_text:'Objeto oficial',org_name:'Órgão Oficial',modality_name:'Pregão - Eletrônico'},
    analysis:{executive_summary:'O valor é sigiloso no edital, mas fixado em R$ 110.000,00 nos metadados. Sessão confirmada.',tender_overview:{estimated_value:110000,object:'obj',organization:'org',modality:'mod'},uncertainties:[]},
    diagnostics:{}
  });
  assert.equal(result.analysis.tender_overview.estimated_value,undefined);
  assert.equal(result.procurement.estimated_value,undefined);
  assert.equal(result.analysis.tender_overview.estimated_value_source,'not_published_in_pncp_metadata');
  assert.equal(result.analysis.tender_overview.object,'Objeto oficial');
  assert.equal(result.analysis.tender_overview.organization,'Órgão Oficial');
  assert.doesNotMatch(result.analysis.executive_summary,/110\.000,00.*metadad/i);
  assert.match(result.analysis.executive_summary,/não apresenta valor estimado positivo/i);
  assert.match(result.analysis.uncertainties.join(' '),/não apresenta valor estimado positivo/i);
});

test('valor positivo do PNCP prevalece sobre valor divergente da IA',()=>{
  const result=reconcileTenderAuthoritativeData({
    procurement:{pncp_key:'x',estimated_value:250000},
    analysis:{executive_summary:'Resumo.',tender_overview:{estimated_value:999999},uncertainties:[]},
    diagnostics:{}
  });
  assert.equal(result.analysis.tender_overview.estimated_value,250000);
  assert.equal(result.procurement.estimated_value,250000);
  assert.equal(result.analysis.tender_overview.estimated_value_source,'pncp_metadata');
});

test('palavras catálogo + acervo genérico não geram CAT',()=>{
  const reqs=detectRequirements('Entrega da medição: 45 recibos, planilha de efetivo uso, catálogo, acervo e relatório de execução até 23/12.');
  assert.equal(reqs.some(x=>x.type==='acervo_tecnico'),false);
});

test('Certidão de Acervo Técnico e CAT contextual continuam detectadas',()=>{
  const byName=detectRequirements('A licitante deverá apresentar Certidão de Acervo Técnico emitida pelo CREA.');
  assert.equal(byName.some(x=>x.type==='acervo_tecnico'),true);
  const byAcronym=detectRequirements('Apresentar CAT emitida pelo CREA para comprovação da experiência técnica.');
  assert.equal(byAcronym.some(x=>x.type==='acervo_tecnico'),true);
});
