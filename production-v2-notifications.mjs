import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync=fs.readFileSync.bind(fs);
const sequentialNotifications=nativeReadFileSync(new URL('./onsite-notifications-v2.js',import.meta.url));

fs.readFileSync=function patchedReadFileSync(path,...args){
  const value=path instanceof URL?path.pathname:String(path);
  const data=nativeReadFileSync(path,...args);
  if(value.endsWith('/app-v2.js')||value.endsWith('\\app-v2.js')){
    if(Buffer.isBuffer(data))return Buffer.concat([data,Buffer.from('\n'),sequentialNotifications]);
    return String(data)+'\n'+sequentialNotifications.toString('utf8');
  }
  return data;
};

syncBuiltinESMExports();
await import('./production-v2.mjs');
