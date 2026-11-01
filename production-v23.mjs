import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const MAX_BODY=12*1024*1024;
const PDF='application/pdf',JPG='image/jpeg',PNG='image/png';
const strictRoutes=[/^\/api\/company-documents$/, /^\/api\/admin-support\/users\/\d+\/documents$/];

function send(res,status,error,code='invalid_upload_signature'){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify({error,code}))}
function signatureOk(buf,mime){if(mime===PDF)return buf.length>=5&&buf.subarray(0,5).toString('ascii')==='%PDF-';if(mime===JPG)return buf.length>=3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff;if(mime===PNG)return buf.length>=8&&buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));return false}
function extensionOk(name,mime){const n=String(name||'').toLowerCase();if(mime===PDF)return n.endsWith('.pdf');if(mime===JPG)return n.endsWith('.jpg')||n.endsWith('.jpeg');if(mime===PNG)return n.endsWith('.png');return false}
function executableSignature(buf){return (buf.length>=2&&buf[0]===0x4d&&buf[1]===0x5a)||(buf.length>=4&&buf[0]===0x7f&&buf[1]===0x45&&buf[2]===0x4c&&buf[3]===0x46)}
async function readBody(req){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>MAX_BODY)throw Object.assign(new Error('Payload muito grande.'),{status:413});chunks.push(c)}return Buffer.concat(chunks)}
function replay(req,buf){req[Symbol.asyncIterator]=async function*(){yield buf};return req}
async function validateUpload(req,res,url){if(req.method!=='POST')return false;const strict=strictRoutes.some(r=>r.test(url.pathname)),simple=url.pathname==='/api/documents';if(!strict&&!simple)return false;let raw;try{raw=await readBody(req)}catch(e){send(res,e.status||413,e.message||'Payload muito grande.','upload_payload_too_large');return true}let body;try{body=raw.length?JSON.parse(raw.toString('utf8')):{}}catch{send(res,400,'JSON inválido.','invalid_json');return true}const mime=String(body.mime_type||'application/octet-stream').toLowerCase().split(';')[0].trim(),name=String(body.filename||''),base64=body.content_base64;if(typeof base64!=='string'){replay(req,raw);return false}let content;try{content=Buffer.from(base64,'base64')}catch{send(res,400,'Conteúdo do arquivo inválido.');return true}if(!content.length){send(res,400,'Arquivo vazio.');return true}if(executableSignature(content)){send(res,400,'Arquivo executável não é permitido.','executable_upload_blocked');return true}if(strict){if(![PDF,JPG,PNG].includes(mime)){send(res,400,'Use somente PDF, JPG ou PNG.','unsupported_upload_type');return true}if(!extensionOk(name,mime)||!signatureOk(content,mime)){send(res,400,'O conteúdo do arquivo não corresponde ao formato informado. Renomear um arquivo não altera seu formato real.','invalid_upload_signature');return true}}else if([PDF,JPG,PNG].includes(mime)&&(!extensionOk(name,mime)||!signatureOk(content,mime))){send(res,400,'O conteúdo do arquivo não corresponde ao formato informado.','invalid_upload_signature');return true}replay(req,raw);return false}

http.createServer=function uploadSecurityCreateServer(...args){const i=args.findIndex(x=>typeof x==='function');if(i<0)return nativeCreateServer(...args);const listener=args[i];args[i]=async(req,res)=>{try{const url=new URL(req.url||'/','http://localhost');if(await validateUpload(req,res,url))return}catch(e){console.error('upload security:',e?.message||e);if(!res.headersSent)return send(res,500,'Falha na validação segura do arquivo.','upload_security_error')}return listener(req,res)};return nativeCreateServer(...args)};

syncBuiltinESMExports();
await import('./production-v22.mjs');
console.log('upload security v1 ready: executable blocking and PDF/JPEG/PNG signature validation');
