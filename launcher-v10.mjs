import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleMovementMetrics } from './movement-metrics-v1.mjs';

const nativeCreateServer=http.createServer.bind(http);

http.createServer=function rlbV10CreateServer(listener){
  return nativeCreateServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleMovementMetrics(req,res,url))return;
    }catch(e){
      console.error('movement metrics gateway error:',e?.message||e);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        return res.end(JSON.stringify({error:'Falha temporária nos indicadores.'}));
      }
    }
    return listener(req,res);
  });
};

syncBuiltinESMExports();
await import('./launcher-v9.mjs');
