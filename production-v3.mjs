import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const notificationV3=nativeReadFileSync(new URL('./onsite-notifications-v3.js',import.meta.url),'utf8');
const draggableAiV1=nativeReadFileSync(new URL('./draggable-ai-v1.js',import.meta.url),'utf8');
const aiUiEnhancements=nativeReadFileSync(new URL('./ai-ui-enhancements.js',import.meta.url),'utf8');
const aiUiCss=nativeReadFileSync(new URL('./ai-ui-enhancements.css',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";
const runtimeCss=`
#rlbNationalNoticeHost{
  top:72px!important;
  bottom:auto!important;
  right:14px!important;
  width:min(300px,calc(100vw - 28px))!important;
  transform:scale(.90);
  transform-origin:top right;
}
#rlbNationalNoticeHost>article{
  padding:8px 9px 9px!important;
  border-radius:11px!important;
}
@media(max-width:600px){
  #rlbNationalNoticeHost{
    top:62px!important;
    right:8px!important;
    width:min(292px,calc(100vw - 16px))!important;
    transform:scale(.92);
  }
}

/* IA-RLB: widget flutuante, arrastável e sem alterar o dashboard */
.ai-fab{
  touch-action:none!important;
  user-select:none!important;
  -webkit-user-select:none!important;
  cursor:grab!important;
  transition:opacity .16s ease,transform .16s ease,box-shadow .2s ease!important;
}
.ai-fab.ai-widget-dragging{cursor:grabbing!important;transition:none!important;transform:none!important}
.ai-fab.ai-widget-fab-hidden{opacity:0!important;pointer-events:none!important;transform:scale(.9)!important}
#ai-assistant.ai-assistant,
#ai-assistant.ai-assistant:target{
  position:fixed!important;
  inset:auto!important;
  width:0!important;
  height:0!important;
  z-index:160!important;
  opacity:1!important;
  pointer-events:none!important;
  transition:none!important;
  display:block!important;
  margin:0!important;
}
#ai-assistant .ai-backdrop{display:none!important}
#ai-assistant .ai-window,
#ai-assistant:target .ai-window{
  display:none!important;
  position:fixed!important;
  inset:auto!important;
  right:auto!important;
  bottom:auto!important;
  max-width:calc(100vw - 12px)!important;
  max-height:calc(100vh - 12px)!important;
  margin:0!important;
  transform:none!important;
  border-radius:18px!important;
  box-shadow:0 26px 72px rgba(0,0,0,.34)!important;
  pointer-events:auto!important;
}
#ai-assistant.ai-widget-open .ai-window,
#ai-assistant.ai-widget-open:target .ai-window{display:flex!important}
#ai-assistant .ai-window-head{
  cursor:grab!important;
  touch-action:none!important;
  user-select:none!important;
  -webkit-user-select:none!important;
}
#ai-assistant .ai-window.ai-widget-window-dragging .ai-window-head{cursor:grabbing!important}
@media(max-width:620px){
  #ai-assistant .ai-window,
  #ai-assistant:target .ai-window{
    border-radius:16px!important;
  }
}
`;

fs.readFileSync=function patchedReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const markerIndex=source.indexOf(legacyMarker);
    const core=markerIndex>=0?source.slice(0,markerIndex):source;
    const finalJs=core+'\n\n'+notificationV3+'\n\n'+draggableAiV1+'\n\n'+aiUiEnhancements;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n'+runtimeCss+'\n'+aiUiCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v2.mjs');
