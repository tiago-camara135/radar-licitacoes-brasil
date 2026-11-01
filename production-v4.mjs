import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initCompanyDocuments, handleCompanyDocumentsRoute } from './company-documents-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const companyDocumentsJs=nativeReadFileSync(new URL('./company-documents-v1.js',import.meta.url),'utf8');
const companyDocumentsCss=nativeReadFileSync(new URL('./company-documents-v1.css',import.meta.url),'utf8');
const brandLogoCss=nativeReadFileSync(new URL('./brand-logo-v1.css',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";

/* Injeta o módulo antes do bloco legado que o runtime v3 remove do app principal. */
fs.readFileSync=function companyDocsReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const index=source.indexOf(legacyMarker);
    const finalJs=index>=0?source.slice(0,index)+'\n\n'+companyDocumentsJs+source.slice(index):source+'\n\n'+companyDocumentsJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+companyDocumentsCss+'\n\n'+brandLogoCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

/* Acrescenta as rotas do cofre documental sem alterar as rotas existentes. */
http.createServer=function companyDocsCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleCompanyDocumentsRoute(req,res,url))return;
    }catch(error){
      console.error('company documents middleware error:',error?.stack||error);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        res.end(JSON.stringify({error:'Erro interno na Central de Habilitação.'}));
      }else try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v3.mjs');
await initCompanyDocuments();
