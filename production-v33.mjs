import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initTenderComplianceMatrixV3Safe,handleTenderComplianceMatrixV3SafeRoute } from './tender-compliance-matrix-v3-safety.mjs';
import { initMetaWhatsapp,handleMetaWhatsappRoute } from './whatsapp-meta-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const matrixJs=nativeReadFileSync(new URL('./tender-readiness-matrix-v3.js',import.meta.url),'utf8');
const matrixCss=nativeReadFileSync(new URL('./tender-readiness-matrix-v3.css',import.meta.url),'utf8');
const metaWhatsappClientJs=nativeReadFileSync(new URL('./whatsapp-meta-client-v1.js',import.meta.url),'utf8');
const appVersion=(()=>{try{return String(JSON.parse(nativeReadFileSync(new URL('./package.json',import.meta.url),'utf8')).version||'unknown').slice(0,40)}catch{return'unknown'}})();
const runtimeName='production-v33';

fs.readFileSync=function matrixFrontendReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/tender-intelligence-upload-v1.js')||value.endsWith('\\tender-intelligence-upload-v1.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data),finalJs=source+'\n\n'+matrixJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/tender-intelligence-v2.css')||value.endsWith('\\tender-intelligence-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data),finalCss=source+'\n\n'+matrixCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data),finalJs=source+'\n\n'+metaWhatsappClientJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  return data;
};

http.createServer=function tenderComplianceMatrixCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');if(i<0)return nativeCreateServer(...args);const listener=args[i];
  args[i]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(req.method==='GET'&&url.pathname==='/api/health'){
        const nativeEnd=res.end.bind(res);
        res.end=(body,...endArgs)=>{
          try{
            const text=Buffer.isBuffer(body)?body.toString('utf8'):String(body??'');
            const payload=JSON.parse(text);
            if(payload&&typeof payload==='object'){
              payload.version=appVersion;
              payload.runtime=runtimeName;
              return nativeEnd(JSON.stringify(payload),...endArgs);
            }
          }catch{}
          return nativeEnd(body,...endArgs);
        };
      }
      if(await handleMetaWhatsappRoute(req,res,url))return;
      if(await handleTenderComplianceMatrixV3SafeRoute(req,res,url))return;
    }catch(error){console.error('production v33 middleware:',error?.stack||error);if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'Erro interno no runtime da aplicação.'}))}else try{res.end()}catch{}return}
    return listener(req,res)
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v32.mjs');
await initMetaWhatsapp();
await initTenderComplianceMatrixV3Safe();
console.log(`tender compliance matrix runtime v3 active: requirement-by-requirement + all candidate documents + criteria + process phase + technical quantity semantic guard + external CSP-safe UI styles; Meta WhatsApp Cloud API adapter loaded; runtime ${runtimeName} version ${appVersion}`);
