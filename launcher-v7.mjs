import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { handleNotificationRoute, initNotifications } from './notifications-v1.mjs';
import { initNotificationMonitorBridge } from './notification-monitor-bridge.mjs';
import { initNotificationPolicyV2 } from './notification-policy-v2.mjs';

const nativeCreateServer=http.createServer.bind(http);

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
await initNotificationPolicyV2();
await initNotificationMonitorBridge();
