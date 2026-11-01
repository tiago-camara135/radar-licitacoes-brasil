import assert from 'node:assert/strict';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const email=`ci-${Date.now()}@example.test`,password='CI-Strong-Pass-2026!';
let cookie='';

async function call(path,{method='GET',body,expected=200,auth=true}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(auth&&cookie)headers.cookie=cookie;
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const set=r.headers.get('set-cookie');if(set)cookie=set.split(';')[0];
  const text=await r.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  assert.equal(r.status,expected,`${method} ${path}: expected ${expected}, got ${r.status}: ${text}`);
  return data;
}

for(let i=0;i<40;i++){
  try{await call('/api/health',{auth:false});break}catch(e){if(i===39)throw e;await new Promise(r=>setTimeout(r,500))}
}

const reg=await call('/api/auth/register',{method:'POST',auth:false,expected:201,body:{email,password}});
assert.equal(reg.user.email,email);
const me=await call('/api/me');assert.equal(me.user.email,email);

const entitlement=await call('/api/entitlements');
assert.equal(entitlement.entitlement.active,true);
assert.equal(entitlement.entitlement.limits.alerts,20);

const alert=await call('/api/alerts',{method:'POST',expected:201,body:{name:'CI Combustíveis RN',keyword:'combustível',uf:'RN',modality_code:6,enabled:true}});
assert.ok(alert.item.id);
const alerts=await call('/api/alerts');
assert.equal(alerts.items.length,1);
assert.equal(alerts.items[0].name,'CI Combustíveis RN');

const fakePdf=Buffer.from('not-a-real-pdf').toString('base64');
const badUpload=await call('/api/company-documents',{method:'POST',expected:400,body:{doc_type:'federal',filename:'certidao.pdf',mime_type:'application/pdf',content_base64:fakePdf}});
assert.equal(badUpload.code,'invalid_upload_signature');

const status=await call('/api/search-status');
assert.equal(status.status?.ok,true);

await call('/api/auth/logout',{method:'POST',body:{}});
console.log('integration smoke: authenticated core flows passed');
