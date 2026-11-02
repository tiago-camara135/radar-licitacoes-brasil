import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initTenderComplianceMatrixV2,handleTenderComplianceMatrixV2Route } from './tender-compliance-matrix-v2.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const matrixJs=nativeReadFileSync(new URL('./tender-readiness-matrix-v2.js',import.meta.url),'utf8');

fs.readFileSync=function matrixFrontendReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/tender-intelligence-upload-v1.js')||value.endsWith('\\tender-intelligence-upload-v1.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data),finalJs=source+'\n\n'+matrixJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  return data;
};

http.createServer=function tenderComplianceMatrixCreateServer(...args){
  const i=args.findIndex(x=>typeof x==='function');if(i<0)return nativeCreateServer(...args);const listener=args[i];
  args[i]=async(req,res)=>{try{const url=new URL(req.url||'/','http://localhost');if(await handleTenderComplianceMatrixV2Route(req,res,url))return}catch(error){console.error('tender compliance matrix middleware:',error?.stack||error);if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:'Erro interno na matriz Empresa × Edital.'}))}else try{res.end()}catch{}return}return listener(req,res)};
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v32.mjs');
await initTenderComplianceMatrixV2();
console.log('tender compliance matrix runtime v2 active: requirement x company evidence + independent confidence score');
