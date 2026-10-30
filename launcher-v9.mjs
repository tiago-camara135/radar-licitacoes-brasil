import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleSearchV3Route, initSearchRouterV3 } from './search-router-v3.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const searchUiScript=nativeReadFileSync(new URL('./search-ui-v3.js',import.meta.url),'utf8');
const nativeCreateServer=http.createServer.bind(http);

fs.readFileSync=function rlbV9ReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const html=nativeReadFileSync(path,...args);
  if(typeof html!=='string')return html;
  if(value.endsWith('/app-professional.html')||value.endsWith('\\app-professional.html')){
    return html.replace('</body>',`<script id="rlb-search-ui-v3">try{${searchUiScript}}catch(e){console.error('RLB search UI V3:',e)}</script></body>`);
  }
  return html;
};

http.createServer=function rlbV9CreateServer(listener){
  return nativeCreateServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleSearchV3Route(req,res,url))return;
    }catch(e){
      console.error('search gateway v3 error:',e?.message||e);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({error:'Falha temporária na pesquisa.'}));
      }
      try{return res.end()}catch{}
    }
    return listener(req,res);
  });
};

syncBuiltinESMExports();
await import('./launcher-v8.mjs');
await initSearchRouterV3();
