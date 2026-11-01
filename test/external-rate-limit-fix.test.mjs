import test from 'node:test';
import assert from 'node:assert/strict';

const BASE='https://radar-licitacoes-brasil-app.onrender.com';
const ORIGIN=new URL(BASE).origin;
const email=`security-verification-${Date.now()}@example.invalid`;
const body=JSON.stringify({email,password:'WrongPassword-2026!'});

async function login(extraHeaders={}){
  const r=await fetch(BASE+'/api/auth/login',{
    method:'POST',
    headers:{Origin:ORIGIN,'Content-Type':'application/json',Accept:'application/json',...extraHeaders},
    body,
    redirect:'manual'
  });
  await r.text();
  return r.status;
}

test('produção mantém bloqueio mesmo com X-Forwarded-For forjado',async()=>{
  const health=await fetch(BASE+'/api/security/origin-health',{headers:{Accept:'application/json'}});
  assert.equal(health.status,200);
  const info=await health.json();
  assert.equal(info.client_ip_guard,'v1');

  let first429=-1;
  const statuses=[];
  for(let i=0;i<23;i++){
    const status=await login({'X-Forwarded-For':`203.0.113.${i+1}`});
    statuses.push(status);
    if(status===429&&first429<0)first429=i+1;
  }
  assert.ok(first429>0&&first429<=23,`rate limit não acionou: ${JSON.stringify(statuses)}`);

  const afterSpoof=await login({'X-Forwarded-For':'192.0.2.250'});
  assert.equal(afterSpoof,429,`X-Forwarded-For forjado contornou bloqueio: ${afterSpoof}`);
  console.log(`PRODUCTION_RATE_LIMIT_FIX_VERIFIED first429=${first429} afterSpoof=${afterSpoof}`);
});
