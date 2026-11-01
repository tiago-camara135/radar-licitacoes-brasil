import { isIP } from 'node:net';

function cleanIpCandidate(value){
  let raw=String(value||'').trim();
  if(!raw)return '';

  if(raw.startsWith('[')){
    const end=raw.indexOf(']');
    if(end>1)raw=raw.slice(1,end);
  }

  const ipv4WithPort=raw.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if(ipv4WithPort)raw=ipv4WithPort[1];

  if(raw.toLowerCase().startsWith('::ffff:')){
    const v4=raw.slice(7);
    if(isIP(v4)===4)return v4;
  }

  return isIP(raw)?raw:'';
}

export function resolveTrustedClientIp(req){
  const headers=req?.headers||{};

  // Render recebe tráfego por Cloudflare. Esse header é preenchido pelo edge
  // e evita confiar no primeiro X-Forwarded-For controlável pelo visitante.
  const cloudflare=cleanIpCandidate(headers['cf-connecting-ip']);
  if(cloudflare)return{ip:cloudflare,source:'cf-connecting-ip'};

  // Cloudflare/Render podem entregar uma cadeia XFF. O cliente consegue
  // influenciar entradas à esquerda; por isso usamos o último IP válido.
  const forwarded=String(headers['x-forwarded-for']||'')
    .split(',')
    .map(cleanIpCandidate)
    .filter(Boolean);
  if(forwarded.length)return{ip:forwarded[forwarded.length-1],source:'x-forwarded-for-rightmost'};

  const socketIp=cleanIpCandidate(req?.socket?.remoteAddress);
  if(socketIp)return{ip:socketIp,source:'socket'};

  return{ip:'unknown',source:'unknown'};
}

export function normalizeTrustedClientIp(req){
  if(!req.headers)req.headers={};
  const resolved=resolveTrustedClientIp(req);

  if(resolved.ip&&resolved.ip!=='unknown')req.headers['x-forwarded-for']=resolved.ip;
  else delete req.headers['x-forwarded-for'];

  return resolved;
}
