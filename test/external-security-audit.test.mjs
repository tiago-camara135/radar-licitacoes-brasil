import test from 'node:test';
import assert from 'node:assert/strict';

const BASE='https://radar-licitacoes-brasil-app.onrender.com';
const ORIGIN=new URL(BASE).origin;
const findings=[];

function add(name,ok,severity,details=''){
  findings.push({name,ok,severity,details});
  console.log(`[security] ${ok?'PASS':'FINDING'} [${severity}] ${name}${details?` — ${details}`:''}`);
}
async function req(path,opt={}){
  const r=await fetch(BASE+path,{redirect:'manual',...opt});
  const text=await r.text();
  return {r,text};
}

test('auditoria externa não destrutiva da produção',async()=>{
  {
    const {r}=await req('/');
    add('HTTPS responde na página inicial',r.status===200,'high',`status=${r.status}`);
    const h=r.headers;
    add('HSTS ativo',/max-age=/i.test(h.get('strict-transport-security')||''),'medium',h.get('strict-transport-security')||'ausente');
    add('CSP ativo',Boolean(h.get('content-security-policy')),'high',h.get('content-security-policy')?'presente':'ausente');
    add('Clickjacking bloqueado',/DENY|SAMEORIGIN/i.test(h.get('x-frame-options')||''),'medium',h.get('x-frame-options')||'ausente');
    add('MIME sniffing bloqueado',(h.get('x-content-type-options')||'').toLowerCase()==='nosniff','medium',h.get('x-content-type-options')||'ausente');
    add('Referrer-Policy configurada',Boolean(h.get('referrer-policy')),'low',h.get('referrer-policy')||'ausente');
  }
  for(const p of ['/.env','/.git/config','/package.json','/package-lock.json','/production-v24.mjs','/render.yaml','/server.js','/%2e%2e/%2e%2e/etc/passwd']){
    const {r,text}=await req(p);
    const exposed=r.status===200 && (p.includes('package')||p.includes('.env')||p.includes('.git')||p.includes('.mjs')||/root:.*:0:0:/.test(text));
    add(`Arquivo sensível não exposto ${p}`,!exposed,'critical',`status=${r.status}`);
  }
  for(const p of ['/api/me','/api/alerts','/api/company-documents','/api/company-documents/profile','/api/admin/users','/api/admin/stats','/api/notifications/profile']){
    const {r}=await req(p,{headers:{accept:'application/json'}});
    add(`Acesso anônimo bloqueado ${p}`,r.status===401||r.status===403,'critical',`status=${r.status}`);
  }
  {
    const {r}=await req('/api/me',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'GET'}});
    const acao=r.headers.get('access-control-allow-origin');
    add('CORS não libera origem externa',!acao||(!['*','https://evil.example'].includes(acao)),'high',`status=${r.status}; ACAO=${acao||'ausente'}`);
  }
  {
    const {r,text}=await req('/api/auth/login',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({email:'nobody@example.invalid',password:'NotARealPassword-2026!'})});
    add('Escrita cross-origin bloqueada',r.status===403,'critical',`status=${r.status}; body=${text.slice(0,100)}`);
  }
  for(const email of ["' OR 1=1--@x.invalid", "admin' OR '1'='1@example.invalid"]){
    const {r,text}=await req('/api/auth/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email,password:"' OR '1'='1"})});
    add('Payload SQLi não autentica',r.status===400||r.status===401||r.status===429,'critical',`status=${r.status}`);
    add('SQLi não vaza erro interno',!/(stack|syntax error|postgres|select |insert |update |delete |at .*\.mjs:\d+)/i.test(text),'high',text.slice(0,120));
  }
  {
    const {r,text}=await req('/api/auth/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{"email":'});
    add('JSON malformado tratado',r.status===400||r.status===429,'medium',`status=${r.status}`);
    add('JSON malformado não expõe stack',!/(stack|at .*\.mjs:\d+|postgres)/i.test(text),'high',text.slice(0,120));
  }
  let first429=-1;
  for(let i=0;i<23;i++){
    const {r}=await req('/api/auth/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({email:'rate-limit-probe@example.invalid',password:'WrongPassword-2026!'})});
    if(r.status===429&&first429<0)first429=i+1;
  }
  add('Rate limit de login entra em ação',first429>0&&first429<=23,'high',`primeiro 429=${first429}`);
  {
    const {r}=await req('/api/auth/login',{method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json','X-Forwarded-For':'203.0.113.77'},body:JSON.stringify({email:'rate-limit-probe@example.invalid',password:'WrongPassword-2026!'})});
    add('X-Forwarded-For não contorna rate limit',r.status===429,'high',`status=${r.status}`);
  }
  {
    const {r,text}=await req('/api/health');
    add('Health endpoint responde',r.status===200,'low',`status=${r.status}`);
    add('Health não expõe credenciais',!/(postgres(?:ql)?:\/\/[^\s]+:[^\s]+@|api[_-]?key|secret|password|token\s*[:=])/i.test(text),'critical',text.slice(0,180));
  }
  const serious=findings.filter(x=>!x.ok&&['critical','high'].includes(x.severity));
  console.log('SECURITY_AUDIT_RESULT='+JSON.stringify({total:findings.length,serious:serious.length,findings}));
  assert.ok(findings.length>=30,'Auditoria externa incompleta');
});
