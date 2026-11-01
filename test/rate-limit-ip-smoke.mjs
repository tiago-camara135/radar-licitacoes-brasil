import assert from 'node:assert/strict';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const origin=new URL(base).origin;
const body=JSON.stringify({email:'security-rate-limit@example.invalid',password:'WrongPassword-2026!'});

async function login(headers={}){
  const response=await fetch(base+'/api/auth/login',{
    method:'POST',
    headers:{origin,'content-type':'application/json',accept:'application/json',...headers},
    body
  });
  await response.text();
  return response.status;
}

// Cenário principal em produção: Cloudflare fornece o IP confiável e um atacante
// varia X-Forwarded-For. O balde de rate limit não pode mudar.
let statuses=[];
for(let i=0;i<21;i++){
  statuses.push(await login({
    'cf-connecting-ip':'198.51.100.201',
    'cf-ray':'security-smoke',
    'x-forwarded-for':`203.0.113.${i+1}`
  }));
}
assert.equal(statuses.slice(0,20).every(s=>s===401),true,JSON.stringify(statuses));
assert.equal(statuses[20],429,JSON.stringify(statuses));
assert.equal(await login({
  'cf-connecting-ip':'198.51.100.201',
  'cf-ray':'security-smoke',
  'x-forwarded-for':'192.0.2.250'
}),429,'mudar X-Forwarded-For não pode liberar o login após bloqueio');

// Fallback sem CF-Connecting-IP: variar somente a entrada da esquerda de XFF
// também não pode criar novos baldes; o último IP válido permanece estável.
statuses=[];
for(let i=0;i<21;i++){
  statuses.push(await login({'x-forwarded-for':`203.0.113.${i+1}, 198.51.100.202`}));
}
assert.equal(statuses.slice(0,20).every(s=>s===401),true,JSON.stringify(statuses));
assert.equal(statuses[20],429,JSON.stringify(statuses));
assert.equal(await login({'x-forwarded-for':'192.0.2.77, 198.51.100.202'}),429,'entrada esquerda forjada não pode contornar o rate limit');

console.log('rate-limit IP smoke: spoof de X-Forwarded-For bloqueado');
