const clean=v=>String(v??'').trim();

export function parsePncpDocumentUrl(value){
  try{
    const u=new URL(String(value||''));
    if(u.hostname!=='pncp.gov.br')return null;
    const m=u.pathname.match(/\/(?:api\/pncp|pncp-api)\/v1\/orgaos\/(\d{14})\/compras\/(\d{4})\/(\d+)\/arquivos(?:\/(\d+))?\/?$/);
    if(!m)return null;
    return{cnpj:m[1],year:Number(m[2]),sequence:Number(m[3]),kind:m[4]?'file':'list',documentSequence:m[4]?Number(m[4]):null};
  }catch{return null}
}

function privateIpHost(host){
  const h=String(host||'').toLowerCase().replace(/^\[|\]$/g,'');
  if(h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0'||h==='::1')return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;
  const p=h.match(/^172\.(\d+)\./);if(p&&Number(p[1])>=16&&Number(p[1])<=31)return true;
  if(/^fc|^fd|^fe80:/i.test(h))return true;
  return false;
}
export function isSafePublicOriginUrl(value){
  try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!privateIpHost(u.hostname)}catch{return false}
}

function decodeHtml(value){
  return String(value||'').replace(/\\u002[fF]/g,'/').replace(/\\\//g,'/').replace(/&amp;/gi,'&').replace(/&#x2F;/gi,'/').replace(/&#47;/g,'/').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");
}
function scoreUrl(url){
  const s=decodeURIComponent(url).toLowerCase();let score=0;
  if(/\.pdf(?:$|[?#])/.test(s))score+=240;
  if(/arquivos\.portaldecompraspublicas\.com\.br\/v1\/download/.test(s))score+=220;
  if(/\/(?:download|downloads|arquivo|arquivos|documento|documentos)\b/.test(s))score+=110;
  if(/edital|termo[-_ ]?de[-_ ]?referencia|projeto[-_ ]?basico|anexo|retifica|errata|planilha|orcamento/.test(s))score+=90;
  if(/\.(?:docx?|xlsx?|odt)(?:$|[?#])/.test(s))score+=40;
  return score;
}
export function extractOriginDocumentUrls(html,baseUrl){
  const raw=decodeHtml(String(html||'')),found=[];
  for(const re of [/(?:href|src|urlDownload|downloadUrl|arquivoUrl)\s*[:=]\s*["']([^"'<>]+)["']/gi,/https?:\/\/[^\s"'<>]+/gi]){
    for(const m of raw.matchAll(re))found.push(m[1]||m[0]);
  }
  const scored=new Map();
  for(let value of found){
    value=decodeHtml(value).trim();if(!value||/^(?:javascript:|data:|mailto:)/i.test(value))continue;
    try{
      const u=new URL(value,baseUrl).href;if(!isSafePublicOriginUrl(u))continue;
      const score=scoreUrl(u);if(score<100)continue;
      scored.set(u,Math.max(score,scored.get(u)||0));
    }catch{}
  }
  return [...scored].sort((a,b)=>b[1]-a[1]).map(([url])=>url);
}

export function decodePdfUpload(base64,maxBytes=18*1024*1024){
  const raw=clean(base64).replace(/^data:application\/pdf;base64,/i,'');
  if(!raw)throw Object.assign(new Error('Selecione um arquivo PDF.'),{status:400});
  if(raw.length>Math.ceil(maxBytes*4/3)+16)throw Object.assign(new Error('O PDF excede o limite de 18 MB.'),{status:413});
  let buffer;try{buffer=Buffer.from(raw,'base64')}catch{throw Object.assign(new Error('PDF inválido.'),{status:400})}
  if(buffer.length<5||buffer.length>maxBytes||buffer.subarray(0,5).toString('ascii')!=='%PDF-')throw Object.assign(new Error('O arquivo precisa ser um PDF válido de até 18 MB.'),{status:400});
  return buffer;
}

export const __test={privateIpHost,scoreUrl,decodeHtml};
