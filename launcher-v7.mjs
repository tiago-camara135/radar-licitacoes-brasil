import fs from 'node:fs';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleNotificationRoute, initNotifications } from './notifications-v1.mjs';
import { initNotificationMonitorBridge } from './notification-monitor-bridge.mjs';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const nativeCreateServer=http.createServer.bind(http);
const notificationCss=nativeReadFileSync(new URL('./notifications-v1.css',import.meta.url),'utf8');
const notificationJs=nativeReadFileSync(new URL('./notifications-v1.js',import.meta.url),'utf8');

fs.readFileSync=function rlbV7ReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  if(value.endsWith('/app-professional.html')||value.endsWith('\\app-professional.html')){
    const html=nativeReadFileSync(path,...args);
    if(typeof html!=='string')return html;
    return html
      .replace('</head>',`<style id="rlb-notifications-v1">${notificationCss}</style></head>`)
      .replace('</body>',`<script id="rlb-notifications-v1-script">${notificationJs}</script></body>`);
  }
  return nativeReadFileSync(path,...args);
};

http.createServer=function rlbV7CreateServer(listener){
  return nativeCreateServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://localhost');
      if(await handleNotificationRoute(req,res,url))return;
    }catch(e){
      console.error('notification gateway error:',e?.message||e);
      if(!res.headersSent){
        res.statusCode=500;
        res.setHeader('Content-Type','application/json; charset=utf-8');
        return res.end(JSON.stringify({error:'Falha temporária nas notificações.'}));
      }
      try{return res.end()}catch{}
    }
    return listener(req,res);
  });
};

syncBuiltinESMExports();
await import('./launcher.mjs');
await initNotifications();
await initNotificationMonitorBridge();
