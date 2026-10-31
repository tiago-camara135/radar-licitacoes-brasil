import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const diagJs=nativeReadFileSync(new URL('./ai-admin-diagnostics-v1.js',import.meta.url),'utf8');
const diagCss=nativeReadFileSync(new URL('./ai-admin-diagnostics-v1.css',import.meta.url),'utf8');

fs.readFileSync=function aiDiagnosticsReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalJs=source+'\n\n'+diagJs;
    return Buffer.isBuffer(data)?Buffer.from(finalJs):finalJs;
  }
  if(value.endsWith('/app-v2.css')||value.endsWith('\\app-v2.css')){
    const source=Buffer.isBuffer(data)?data.toString('utf8'):String(data);
    const finalCss=source+'\n\n'+diagCss;
    return Buffer.isBuffer(data)?Buffer.from(finalCss):finalCss;
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v9.mjs');
console.log('IA RLB admin diagnostics UI ready');
