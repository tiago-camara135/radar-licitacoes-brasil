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
