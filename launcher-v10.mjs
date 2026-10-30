import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleMovementMetrics } from './movement-metrics-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const movementPanelJs=nativeReadFileSync(new URL('./movement-panel-v2.js',import.meta.url),'utf8');
const headerControlsJs=nativeReadFileSync(new URL('./header-controls-v1.js',import.meta.url),'utf8');
const feedRefreshJs=nativeReadFileSync(new URL('./feed-refresh-v1.js',import.meta.url),'utf8');

const staticThemeControl=`<div id="rlbThemeControl" role="group" aria-label="Escolher tema do site"><button type="button" data-rlb-theme="light" aria-pressed="false" title="Tema claro"><span class="rlb-theme-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></span><span class="rlb-theme-label">Claro</span></button><button type="button" data-rlb-theme="dark" aria-pressed="false" title="Tema escuro"><span class="rlb-theme-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg></span><span class="rlb-theme-label">Escuro</span></button></div>`;

fs.readFileSync=function rlbV10ReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const file=nativeReadFileSync(path,...args);
  if(typeof file!=='string')return file;

  if(value.endsWith('/institutional-v2.js')||value.endsWith('\\institutional-v2.js')){
    return file.replace(/\n\s*installUsageGuide\(\);/,'');
  }

  if(value.endsWith('/rlb-product-v6.js')||value.endsWith('\\rlb-product-v6.js')){
    return `${file}\n;try{window.RLBHeaderControlsStabilize?.()}catch(e){console.warn('RLB header stabilize:',e?.message||e)}`;
  }

  if(value.endsWith('/app-professional.html')||value.endsWith('\\app-professional.html')){
    const hardRemoveStyle='<style id="rlb-remove-usage-guide">#rlbUsageGuide,.rlb-usage-guide{display:none!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important}#rlbQuickAccess,#rlbQuickNotifications,#rlbQuickAdmin{display:none!important}</style>';
    const scripts=`<script id="rlb-movement-panel-v2-final">${movementPanelJs}</script><script id="rlb-header-controls-v1-final">${headerControlsJs}</script><script id="rlb-feed-refresh-v1-final">${feedRefreshJs}</script>`;
    let out=file;
    if(!out.includes('id="rlbThemeControl"'))out=out.replace('<div id="who" class="who-pill"></div>',`${staticThemeControl}<div id="who" class="who-pill"></div>`);
    return out.replace('</head>',`${hardRemoveStyle}</head>`).replace('</body>',`${scripts}</body>`);
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
