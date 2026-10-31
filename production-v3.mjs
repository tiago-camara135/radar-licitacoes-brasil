import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const notificationV3=nativeReadFileSync(new URL('./onsite-notifications-v3.js',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";
const notificationCss=`
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

/* IA-RLB integrada ao dashboard: sem backdrop e sem bloqueio da interface */
.ai-backdrop{display:none!important}
@media(min-width:821px){
  .app-shell:has(#ai-assistant:target){
    display:grid;
    grid-template-columns:minmax(0,1fr) clamp(340px,26vw,390px);
    column-gap:16px;
    padding:0 18px 18px;
    align-items:start;
  }
  .app-shell:has(#ai-assistant:target)>.platform-strip,
  .app-shell:has(#ai-assistant:target)>.sidebar{
    grid-column:1/-1;
    margin-left:-18px;
    margin-right:-18px;
    width:auto;
  }
  .app-shell:has(#ai-assistant:target)>.main{
    grid-column:1;
    grid-row:3;
    width:100%;
    margin:0;
    min-width:0;
  }
  .app-shell:has(#ai-assistant:target) .ai-fab{
    opacity:0;
    pointer-events:none;
    transform:scale(.9);
  }
  #ai-assistant.ai-assistant{display:none}
  #ai-assistant.ai-assistant:target{
    display:block;
    position:sticky;
    grid-column:2;
    grid-row:3;
    inset:auto;
    top:88px;
    width:100%;
    height:calc(100vh - 106px);
    margin-top:18px;
    z-index:70;
    opacity:1;
    pointer-events:auto;
    transition:none;
  }
  #ai-assistant.ai-assistant:target .ai-window{
    position:relative;
    inset:auto;
    right:auto;
    bottom:auto;
    width:100%;
    height:100%;
    border-radius:18px;
    transform:none;
    box-shadow:var(--shadow2);
  }
}
@media(max-width:820px){
  #ai-assistant.ai-assistant{
    display:none;
    position:static;
    inset:auto;
    width:calc(100% - 20px);
    height:min(72vh,620px);
    margin:12px auto 88px;
    opacity:1;
    pointer-events:auto;
    transition:none;
  }
  #ai-assistant.ai-assistant:target{display:block}
  #ai-assistant.ai-assistant .ai-window{
    position:relative;
    inset:auto;
    right:auto;
    bottom:auto;
    width:100%;
    height:100%;
    border-radius:18px;
    transform:none;
    box-shadow:var(--shadow2);
  }
  .app-shell:has(#ai-assistant:target) .ai-fab{display:none}
}
`;

fs.readFileSync=function patchedReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const markerIndex=source.indexOf(legacyMarker);
    const core=markerIndex>=0?source.slice(0,markerIndex):source;
    const finalJs=core+'\n\n'+notificationV3;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n'+notificationCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v2.mjs');
