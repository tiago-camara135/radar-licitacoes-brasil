import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTechnicalQuantitySafetyV3 } from '../tender-compliance-matrix-v3-safety.mjs';

test('quantidade alta em documento semanticamente ambiguo nao vira prova tecnica suficiente',()=>{
  const matrix={version:'3.0',readiness_score:80,confidence_score:90,confidence_level:'muito_alta',counts:{review:0},diagnostics:{},requirements:[{
    requirement_id:'R01',type:'atestado_tecnico',condition:'obrigatorio',mandatory:true,state:'apparently_compatible',confidence:88,readiness_weight:.8,status_label:'Compatibilidade técnica aparente — revisar',detail:'Aderência aparente.',
    criteria:[{code:'quantitative',status:'pass',label:'Quantitativo mínimo aparentemente comprovado',evidence:'Exigido 300 unidades; maior valor localizado: 500 unidades.'}],
    candidate_documents:[
      {id:1,rank:1,state:'apparently_compatible',semantic:{status:'pass',label:'Aderência semântica forte'}},
      {id:2,rank:2,state:'manual_review',semantic:{status:'review',label:'Aderência técnica não demonstrada'}}
    ]
  }]};
  const out=applyTechnicalQuantitySafetyV3(matrix);
  const row=out.requirements[0],q=row.criteria[0];
  assert.equal(q.status,'review');
  assert.equal(row.state,'partial_match');
  assert.ok(row.confidence<=82);
  assert.equal(out.diagnostics.technical_quantity_semantic_guard,true);
});

test('quantitativo pode permanecer comprovado quando ha um unico documento semanticamente forte',()=>{
  const matrix={version:'3.0',readiness_score:80,confidence_score:88,confidence_level:'alta',counts:{review:1},diagnostics:{},requirements:[{
    requirement_id:'R01',type:'atestado_tecnico',condition:'obrigatorio',mandatory:true,state:'apparently_compatible',confidence:88,readiness_weight:.8,
    criteria:[{code:'quantitative',status:'pass',evidence:'Exigido 300 unidades; maior valor localizado: 420 unidades.'}],
    candidate_documents:[{id:1,rank:1,state:'apparently_compatible',semantic:{status:'pass'}}]
  }]};
  const out=applyTechnicalQuantitySafetyV3(matrix);
  assert.equal(out.requirements[0].criteria[0].status,'pass');
  assert.equal(out.diagnostics.technical_quantity_semantic_guard,undefined);
});
