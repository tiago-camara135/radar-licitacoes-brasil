import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';

const nativeCreateServer=http.createServer.bind(http);
const corporateJs=fs.readFileSync(new URL('./corporate-ui-v3.js',import.meta.url));
const corporateCss=fs.readFileSync(new URL('./corporate-ui-v3.css',import.meta.url));
const hardeningJs=fs.readFileSync(new URL('./ui-action-hardening-v1.js',import.meta.url));
const hardeningCss=fs.readFileSync(new URL('./ui-action-hardening-v1.css',import.meta.url));
const responsiveHeaderCss=fs.readFileSync(new URL('./responsive-header-v1.css',import.meta.url));
const supportJs=fs.readFileSync(new URL('./admin-user-support-v1.js',import.meta.url));
const supportCss=fs.readFileSync(new URL('./admin-user-support-v1.css',import.meta.url));
const runtimeCss=Buffer.from(`\nhtml.rlb-corporate-v3 .search-cta{display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important}\nhtml.rlb-corporate-v3 .search-cta svg{width:16px!important;height:16px!important;display:block!important;stroke:currentColor!important;flex:0 0 auto!important}\nhtml.rlb-corporate-v3 .theme-control svg{width:14px!important;height:14px!important;display:block!important;stroke:currentColor!important;margin:auto!important}\n`);
const runtimeJs=Buffer.from(`\n;(()=>{const m=document.querySelector('meta[name="rlb-ui-build"]');if(m)m.content='3.0.3';window.__RLB_UI_BUILD__='3.0.3';})();\n`);
const combinedSupportJs=Buffer.concat([supportJs,Buffer.from('\n\n'),corporateJs,Buffer.from('\n\n'),hardeningJs,runtimeJs]);
const combinedSupportCss=Buffer.concat([supportCss,Buffer.from('\n\n'),corporateCss,Buffer.from('\n\n'),hardeningCss,Buffer.from('\n\n'),responsiveHeaderCss,runtimeCss]);

/* Falha cedo se alguma camada de navegador tiver erro de sintaxe. */
new Function(corporateJs.toString('utf8'));
new Function(hardeningJs.toString('utf8'));
new Function(combinedSupportJs.toString('utf8'));

http.createServer=function corporateUiCreateServer(...args){
  const listenerIndex=args.findIndex(x=>typeof x==='function');
  if(listenerIndex<0)return nativeCreateServer(...args);
  const listener=args[listenerIndex];
  args[listenerIndex]=async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      /*
       * admin-user-support-v1 é o último CSS/JS explícito do HTML atual.
       * A camada corporativa, o hardening de ações e os ajustes responsivos são
       * anexados aqui para prevalecerem sem alterar IDs, banco, integrações
       * ou regras de negócio.
       */
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(combinedSupportJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/admin-user-support-v1.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(combinedSupportCss);
      }
      /* Endpoints individuais mantidos para diagnóstico e manutenção futura. */
      if(req.method==='GET'&&url.pathname==='/assets/corporate-ui-v3.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(corporateJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/corporate-ui-v3.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(corporateCss);
      }
      if(req.method==='GET'&&url.pathname==='/assets/ui-action-hardening-v1.js'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/javascript; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(hardeningJs);
      }
      if(req.method==='GET'&&url.pathname==='/assets/ui-action-hardening-v1.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(hardeningCss);
      }
      if(req.method==='GET'&&url.pathname==='/assets/responsive-header-v1.css'){
        res.statusCode=200;
        res.setHeader('Content-Type','text/css; charset=utf-8');
        res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('X-RLB-UI-Build','3.0.3');
        return res.end(responsiveHeaderCss);
      }
      if(req.method==='GET'&&url.pathname==='/api/ui-build'){
        res.statusCode=200;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({ok:true,frontend:'3.0.3',visual_system:'corporate-govtech-v3',action_hardening:'v1',responsive_header:'v2',interaction_layout:'v1',search_results:'v2-direct-assets',habilitation_badge:'v2-direct-load',admin_user_support:'v1'}));
      }
    }catch(error){
      console.error('corporate UI middleware:',error?.stack||error);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        res.setHeader('Cache-Control','no-store');
        return res.end(JSON.stringify({error:'Erro interno na camada visual corporativa.'}));
      }
      try{res.end()}catch{}
      return;
    }
    return listener(req,res);
  };
  return nativeCreateServer(...args);
};

syncBuiltinESMExports();
await import('./production-v19.mjs');
console.log('corporate UI v3 ready: professional GovTech visual layer active');
console.log('UI action hardening v1 ready: search, alerts, documents, notifications and admin actions protected');
console.log('responsive layout v2 ready: header and interactive card overlap protection active');
