import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function patchedReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  if (value.endsWith('/app.html') || value.endsWith('\\app.html')) {
    return originalReadFileSync.call(fs, new URL('./app-professional.html', import.meta.url), ...args);
  }
  return originalReadFileSync.call(fs, path, ...args);
};

syncBuiltinESMExports();
await import('./server.mjs');
