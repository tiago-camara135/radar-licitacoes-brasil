import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const dossierJs=nativeReadFileSync(new URL('./company-profile-dossier-v2.js',import.meta.url),'utf8');
const dossierCss=nativeReadFileSync(new URL('./company-profile-dossier-v2.css',import.meta.url),'utf8');
const legacyMarker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";

fs.readFileSync=function dossierReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const index=source.indexOf(legacyMarker);
    const finalJs=index>=0?source.slice(0,index)+'\n\n'+dossierJs+source.slice(index):source+'\n\n'+dossierJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+dossierCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v8.mjs');
console.log('company dossier profile v2 ready: clean form + linked company summary');
