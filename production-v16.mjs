import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const legacy=`if(root)root.innerHTML='<div class="empty-state">Pesquisando…</div>';`;
const enhanced=`if(root){if(typeof window.__rlbBeginSearchLoading==='function')window.__rlbBeginSearchLoading();else root.innerHTML='<div class="empty-state">Pesquisando…</div>';}`;
let reported=false;

fs.readFileSync=function directSearchLoadingReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalJs=source.includes(legacy)?source.replace(legacy,enhanced):source;
    if(!reported){
      console.log(finalJs!==source?'search loading integration v3 ready: runSearch placeholder replaced by animated loader':'search loading integration v3 warning: legacy placeholder not found');
      reported=true;
    }
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v15.mjs');
console.log('RLB search loading v3 active: direct runSearch integration');
