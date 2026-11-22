import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const origin=String(process.env.APP_ORIGIN||base);
const suffix=Date.now();
const password='AdminAudit-CI!2026-Strong';
const adminEmail=`admin-audit-${suffix}@example.test`;
const userEmail=`user-audit-${suffix}@example.test`;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:1});
let adminId=null,userId=null,adminCookie='',userCookie='';

async function request(path,{method='GET',body,cookie='',requestOrigin,expected=200}={}){
  const headers={accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  if(cookie)headers.cookie=cookie;
  if(requestOrigin!==undefined)headers.origin=requestOrigin;
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const setCookie=response.headers.get('set-cookie');
  const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={text}}
  assert.equal(response.status,expected,`${method} ${path}: expected ${expected}, got ${response.status}: ${text}`);
  return {data,setCookie};
}
function cookieOf(setCookie){return setCookie?setCookie.split(';')[0]:''}

try{
  const admin=await request('/api/auth/register',{method:'POST',body:{email:adminEmail,password},expected:201});
  adminId=Number(admin.data.user.id);adminCookie=cookieOf(admin.setCookie);assert.ok(adminCookie);
  const user=await request('/api/auth/register',{method:'POST',body:{email:userEmail,password},expected:201});
  userId=Number(user.data.user.id);userCookie=cookieOf(user.setCookie);assert.ok(userCookie);
  await pool.query("UPDATE users SET role='admin' WHERE id=$1",[adminId]);

  await request('/api/admin-center/overview',{expected:401});
  await request('/api/admin-center/overview',{cookie:userCookie,expected:403});
  const overview=await request('/api/admin-center/overview',{cookie:adminCookie});
  assert.ok(overview.data.data);
  const settings=await request('/api/admin-center/settings',{cookie:adminCookie});
  assert.ok(settings.data.settings);

  const health=await request('/api/admin-center/health',{cookie:adminCookie});
  assert.equal(health.data.data?.database?.ok,true);

  await request(`/api/admin-support/users/${userId}`,{cookie:userCookie,expected:403});
  const bundle=await request(`/api/admin-support/users/${userId}`,{cookie:adminCookie});
  assert.ok(bundle.data.data);

  await request('/api/admin-center/settings',{method:'PUT',cookie:adminCookie,requestOrigin:'https://cross-origin.invalid',body:{public_notice:'must not be saved'},expected:403});
  await request(`/api/admin-support/users/${userId}/company`,{method:'PATCH',cookie:adminCookie,requestOrigin:'https://cross-origin.invalid',body:{legal_name:'Cross Origin Blocked'},expected:403});

  const saved=await request('/api/admin-center/settings',{method:'PUT',cookie:adminCookie,requestOrigin:origin,body:{public_notice:'Admin smoke test',public_notice_enabled:true}});
  assert.equal(saved.data.ok,true);
  const company=await request(`/api/admin-support/users/${userId}/company`,{method:'PATCH',cookie:adminCookie,requestOrigin:origin,body:{legal_name:'EMPRESA TESTE ADMIN',state:'RN',municipality:'Natal'}});
  assert.ok(company.data.item);

  await request(`/api/admin-center/users/${adminId}/logout`,{method:'POST',cookie:adminCookie,requestOrigin:origin,expected:400});
  console.log('admin center smoke passed: auth, role isolation, health, user support bundle, origin guard and self-session protection');
}finally{
  if(adminId||userId)await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[])',[[adminId,userId].filter(Boolean)]).catch(()=>{});
  await pool.end();
}
