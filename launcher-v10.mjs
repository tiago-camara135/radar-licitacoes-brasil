import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleMovementMetrics } from './movement-metrics-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const movementPanelJs=nativeReadFileSync(new URL('./movement-panel-v2.js',import.meta.url),'utf8');

fs.readFileSync=function rlbV10ReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const file=nativeReadFileSync(path,...args);
  if(typeof file!=='string')return file;

  if(value.endsWith('/institutional-v2.js')||value.endsWith('\\institutional-v2.js')){
    return file.replace(/\n\s*installUsageGuide\(\);/,'');
  }

  if(value.endsWith('/app-professional.html')||value.endsWith('\\app-professional.html')){
    const hardRemoveStyle='<style id="rlb-remove-usage-guide">#rlbUsageGuide,.rlb-usage-guide{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}</style>';
    const script=`<script id="rlb-movement-panel-v2-final">${movementPanelJs}</script>`;
    return file.replace('</head>',`${hardRemoveStyle}</head>`).replace('</body>',`${script}</body>`);
  }
  return file;
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
