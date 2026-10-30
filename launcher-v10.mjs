import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleMovementMetrics } from './movement-metrics-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const movementPanelJs=nativeReadFileSync(new URL('./movement-panel-v2.js',import.meta.url),'utf8');

fs.readFileSync=function rlbV10ReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const html=nativeReadFileSync(path,...args);
  if(typeof html!=='string')return html;
  if(value.endsWith('/app-professional.html')||value.endsWith('\\app-professional.html')){
    const script=`<script id="rlb-movement-panel-v2-final">${movementPanelJs}</script>`;
    return html.replace('</body>',`${script}</body>`);
  }
  return html;
};

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
