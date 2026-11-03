import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneDigitsMeta,buildMetaTemplatePayload,metaProviderStatusFromEnv,sendMetaTemplate} from '../whatsapp-meta-v1.mjs';

test('normaliza telefone brasileiro para dígitos aceitos pela Meta',()=>{
  assert.equal(phoneDigitsMeta('(84) 99999-0000'),'5584999990000');
  assert.equal(phoneDigitsMeta('+55 11 98888-7777'),'5511988887777');
  assert.equal(phoneDigitsMeta('123'),null);
});

test('monta template de alerta Meta com sete variáveis em ordem',()=>{
  const payload=buildMetaTemplatePayload({to:'+55 84 99999-0000',templateName:'radar_alerta_licitacao',language:'pt_BR',variables:['A','B','C','D','E','F','G']});
  assert.equal(payload.messaging_product,'whatsapp');
  assert.equal(payload.to,'5584999990000');
  assert.equal(payload.type,'template');
  assert.equal(payload.template.name,'radar_alerta_licitacao');
  assert.equal(payload.template.language.code,'pt_BR');
  assert.deepEqual(payload.template.components[0].parameters.map(x=>x.text),['A','B','C','D','E','F','G']);
});

test('monta template de autenticação com código no corpo e botão copy-code compatível',()=>{
  const payload=buildMetaTemplatePayload({to:'+55 84 99999-0000',templateName:'radar_codigo_verificacao',variables:['654321'],authentication:true,verifyButtonSubtype:'url'});
  assert.equal(payload.template.components.length,2);
  assert.equal(payload.template.components[0].type,'body');
  assert.equal(payload.template.components[0].parameters[0].text,'654321');
  assert.equal(payload.template.components[1].type,'button');
  assert.equal(payload.template.components[1].sub_type,'url');
  assert.equal(payload.template.components[1].index,'0');
  assert.equal(payload.template.components[1].parameters[0].text,'654321');
});

test('status só marca Meta como configurada quando credenciais e templates existem',()=>{
  const env={META_WHATSAPP_ACCESS_TOKEN:'token',META_WHATSAPP_PHONE_NUMBER_ID:'123456',META_WHATSAPP_ALERT_TEMPLATE_NAME:'radar_alerta',META_WHATSAPP_VERIFY_TEMPLATE_NAME:'radar_verifica',META_WHATSAPP_GRAPH_VERSION:'v26.0'};
  const status=metaProviderStatusFromEnv(env);
  assert.equal(status.provider,'meta-cloud');
  assert.equal(status.configured,true);
  assert.equal(status.verification_configured,true);
  assert.equal(status.graph_version,'v26.0');
  assert.equal(metaProviderStatusFromEnv({...env,META_WHATSAPP_ALERT_TEMPLATE_NAME:''}).configured,false);
});

test('envia template pela rota oficial /messages com Bearer token e retorna wamid',async()=>{
  let called=null;
  const fakeFetch=async(url,opt)=>{called={url,opt};return{ok:true,status:200,json:async()=>({messages:[{id:'wamid.TESTE'}]})}};
  const env={META_WHATSAPP_ACCESS_TOKEN:'secret-token',META_WHATSAPP_PHONE_NUMBER_ID:'998877',META_WHATSAPP_ALERT_TEMPLATE_NAME:'radar_alerta',META_WHATSAPP_TEMPLATE_LANGUAGE:'pt_BR',META_WHATSAPP_GRAPH_VERSION:'v26.0'};
  const id=await sendMetaTemplate({to:'+55 84 99999-0000',templateName:'radar_alerta',variables:['1','2','3','4','5','6','7'],fetchImpl:fakeFetch,env});
  assert.equal(id,'wamid.TESTE');
  assert.equal(called.url,'https://graph.facebook.com/v26.0/998877/messages');
  assert.equal(called.opt.method,'POST');
  assert.equal(called.opt.headers.Authorization,'Bearer secret-token');
  const body=JSON.parse(called.opt.body);
  assert.equal(body.to,'5584999990000');
  assert.equal(body.template.name,'radar_alerta');
});

test('não tenta chamada externa se a Meta estiver incompleta',async()=>{
  await assert.rejects(()=>sendMetaTemplate({to:'+55 84 99999-0000',templateName:'radar_alerta',variables:['x'],fetchImpl:async()=>{throw new Error('não deveria chamar')},env:{META_WHATSAPP_PHONE_NUMBER_ID:'123'}}),e=>e?.providerUnavailable===true);
});
