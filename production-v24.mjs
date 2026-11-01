import http from 'node:http';
import { readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { Pool } from 'pg';

const nativeCreateServer=http.createServer.bind(http);
const WRITE_METHODS=new Set(['POST','PUT','PATCH','DELETE']);

function normalizeOrigin(value){
  const raw=String(value||'').trim();
  if(!raw)return '';
  try{
    const u=new URL(raw);
    if(!['http:','https:'].includes(u.protocol))return '';
    return `${u.protocol}//${u.host}`;
  }catch{return ''}
}

const configuredRaw=String(process.env.APP_ORIGIN||'').split(',').map(v=>v.trim()).filter(Boolean);
const configuredOrigins=[...new Set(configuredRaw.map(normalizeOrigin).filter(Boolean))];
const primaryConfiguredOrigin=configuredOrigins[0]||'';
/* Módulos históricos fazem comparação literal com APP_ORIGIN. A variável é
   canonicalizada antes do carregamento deles, evitando diferenças de barra
   final/case sem desativar a proteção de origem. */
if(primaryConfiguredOrigin)process.env.APP_ORIGIN=primaryConfiguredOrigin;

/* Corrige duas sobras de versões antigas da busca sem alterar a regra de
   negócio: openOnly foi removido e Limpar deve voltar para Todas as ativas. */
const appJsSource=readFileSync(new URL('./app-v2.js',import.meta.url),'utf8');
const appJsPatched=appJsSource
  .replace("openOnly:String($('#searchOpenOnly')?.checked||false),",'')
  .replace("if($('#searchDays'))$('#searchDays').value='7';if($('#searchOpenOnly'))$('#searchOpenOnly').checked=false;","if($('#searchDays'))$('#searchDays').value='0';");

function securityHeaders(res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
}

function requestOrigin(req){
  const host=String(req.headers.host||'').trim();
  const forwarded=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim().toLowerCase();
  const proto=forwarded||((req.socket&&req.socket.encrypted)?'https':'http');
  if(!host||!['http','https'].includes(proto))return '';
  return normalizeOrigin(`${proto}://${host}`);
}

function reject(res){
  securityHeaders(res);
  res.statusCode=403;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify({error:'Origem não autorizada.',code:'origin_not_authorized'}));
}

function normalizeTrustedBrowserOrigin(req,res){
  const method=String(req.method||'GET').toUpperCase();
  if(!WRITE_METHODS.has(method))return false;
  const rawOrigin=String(req.headers.origin||'').trim();
  /* Clientes não-browser e chamadas internas não enviam Origin. Mantemos a
     compatibilidade; autenticação e autorização continuam no handler final. */
  if(!rawOrigin)return false;
  const origin=normalizeOrigin(rawOrigin);
  if(!origin){reject(res);return true}
  const current=requestOrigin(req);
  const trustedByHost=Boolean(current&&origin===current);
  const trustedByConfig=configuredOrigins.includes(origin);
  if(!trustedByHost&&!trustedByConfig){
    console.warn(`origin guard rejected ${method} ${String(req.url||'/').split('?')[0]} origin=${origin} host=${current||'unknown'}`);
    reject(res);return true;
  }
  /* Depois de validar o host real, normaliza para satisfazer módulos legados
     que ainda comparam Origin e APP_ORIGIN literalmente. */
  if(primaryConfiguredOrigin)req.headers.origin=primaryConfiguredOrigin;
  return false;
}

http.createServer=function originGuardCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');
  if(i<0)return nativeCreateServer(...args);
  const listener=args[i];
  args[i]=(req,res)=>{
    const pathname=String(req.url||'/').split('?')[0];
    if(req.method==='GET'&&pathname==='/api/security/origin-health'){
      securityHeaders(res);
      res.statusCode=200;
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.end(JSON.stringify({ok:true,guard:'v1',configured_origins:configuredOrigins.length,request_origin_detection:'host+forwarded-proto',runtime:'2.11.5'}));
    }
    if(req.method==='GET'&&pathname==='/assets/app-v2.js'){
      securityHeaders(res);
      res.statusCode=200;
      res.setHeader('Content-Type','application/javascript; charset=utf-8');
      res.setHeader('X-RLB-UI-Build','2.11.5');
      return res.end(appJsPatched);
    }
    if(normalizeTrustedBrowserOrigin(req,res))return;
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

async function ensureCompatibilitySchema(){
  const connectionString=String(process.env.DATABASE_URL||'');
  if(!connectionString)return;
  const ssl=/[?&]sslmode=disable(?:&|$)/i.test(connectionString)?false:{rejectUnauthorized:false};
  const db=new Pool({connectionString,ssl,max:1,idleTimeoutMillis:5000});
  try{
    await db.query(`CREATE TABLE IF NOT EXISTS user_subscriptions(
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company_name TEXT,
      phone TEXT,
      plan TEXT NOT NULL DEFAULT 'Essencial',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','trial','suspended','expired')),
      expires_at TIMESTAMPTZ,
      max_alerts INTEGER NOT NULL DEFAULT 20,
      max_documents INTEGER NOT NULL DEFAULT 100,
      ai_daily_limit INTEGER NOT NULL DEFAULT 200,
      notes TEXT,
      updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await db.query('CREATE INDEX IF NOT EXISTS idx_subscription_status ON user_subscriptions(status,expires_at)');
  }finally{await db.end()}
}

syncBuiltinESMExports();
await import('./production-v23.mjs');
await ensureCompatibilitySchema();
console.log(`origin guard v1 ready: browser same-origin normalization active; configured=${configuredOrigins.length}; runtime=2.11.5`);
console.log('system consistency v1 ready: active search reset normalized, stale openOnly removed, subscription schema ensured');
