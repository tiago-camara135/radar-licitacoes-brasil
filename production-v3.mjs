import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const notificationV3=nativeReadFileSync(new URL('./onsite-notifications-v3.js',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";

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
  return data;
};

syncBuiltinESMExports();
await import('./production-v2.mjs');
