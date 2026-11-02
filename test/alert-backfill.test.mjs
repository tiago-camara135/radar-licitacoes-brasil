import test from 'node:test';
import assert from 'node:assert/strict';
import { alertBackfillMatches,isAlertMutation } from '../alert-backfill-v1.mjs';

test('detecta apenas mutacoes de alerta que exigem reconciliacao',()=>{
  assert.equal(isAlertMutation('POST','/api/alerts'),true);
  assert.equal(isAlertMutation('PATCH','/api/alerts/17'),true);
  assert.equal(isAlertMutation('GET','/api/alerts'),false);
  assert.equal(isAlertMutation('DELETE','/api/alerts/17'),false);
});

test('matching do backfill respeita UF, palavra-chave sem acento e modalidade',()=>{
  const alert={keyword:'manutencao',uf:'RN',region:'ALL',modality_code:6,min_value:null,max_value:null};
  const row={object_text:'Contratação de serviços de manutenção preventiva',org_name:'Prefeitura',unit_name:'Secretaria',municipality:'Natal',uf:'RN',modality_code:6,org_cnpj:'12345678000199',estimated_value:'100000',raw:{}};
  assert.equal(alertBackfillMatches(alert,row),true);
  assert.equal(alertBackfillMatches({...alert,uf:'SP'},row),false);
  assert.equal(alertBackfillMatches({...alert,modality_code:8},row),false);
});

test('matching preserva a semantica atual para valor ausente',()=>{
  const row={object_text:'Aquisição de materiais',org_name:'Órgão',unit_name:'Unidade',municipality:'Natal',uf:'RN',modality_code:6,org_cnpj:'',estimated_value:null,raw:{}};
  assert.equal(alertBackfillMatches({region:'ALL',min_value:50000,max_value:100000},row),true);
});
