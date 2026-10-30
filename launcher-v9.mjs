import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleSearchV3Route, initSearchRouterV3 } from './search-router-v3.mjs';

const nativeCreateServer=http.createServer.bind(http);

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
