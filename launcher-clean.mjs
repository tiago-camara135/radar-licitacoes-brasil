import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { initLiveMonitor, handleLiveRoute } from './live-monitor-v5.mjs';
import { initAiRlb, handleAiRlbRoute } from './ai-rlb-router.mjs';
import { handleNotificationRoute, initNotifications } from './notifications-v1.mjs';
import { initNotificationMonitorBridge } from './notification-monitor-bridge.mjs';
import { initNotificationPolicyV2 } from './notification-policy-v2.mjs';
import { initNotificationPolicyV3 } from './notification-policy-v3.mjs';
import { initAdminSelfHeal } from './admin-selfheal.mjs';
import { handleSearchV3Route, initSearchRouterV3 } from './search-router-v3.mjs';
import { handleMovementMetrics } from './movement-metrics-v1.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const cleanHtml=nativeReadFileSync(new URL('./app-clean-v1.html',import.meta.url),'utf8');
const cleanCss=nativeReadFileSync(new URL('./clean-ui-v1.css',import.meta.url),'utf8');
const cleanJs=nativeReadFileSync(new URL('./clean-ui-v1.js',import.meta.url),'utf8');
const finalHtml=cleanHtml
  .replace('__RLB_CLEAN_CSS__',`<style id="rlb-clean-ui-css">${cleanCss}</style>`)
  .replace('__RLB_CLEAN_JS__',`<script id="rlb-clean-ui-js">${cleanJs}</script>`);

fs.readFileSync=function cleanReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  if(value.endsWith('/app.html')||value.endsWith('\\app.html'))return finalHtml;
  return nativeReadFileSync(path,...args);
};

http.createServer=function cleanCreateServer(listener){
  return nativeCreateServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleAiRlbRoute(req,res,url))return;
      if(await handleLiveRoute(req,res,url))return;
      if(await handleNotificationRoute(req,res,url))return;
      if(await handleSearchV3Route(req,res,url))return;
      if(await handleMovementMetrics(req,res,url))return;
    }catch(e){
      console.error('clean gateway error:',e?.message||e);
      if(!res.headersSent){res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify({error:'Falha temporária no serviço.'}))}
      try{return res.end()}catch{}
    }
    return listener(req,res);
  });
};

syncBuiltinESMExports();
await initAiRlb();
await initLiveMonitor();
await initNotifications();
await initNotificationPolicyV2();
await initNotificationMonitorBridge();
await initNotificationPolicyV3();
await initAdminSelfHeal();
await initSearchRouterV3();
await import('./server.mjs');
