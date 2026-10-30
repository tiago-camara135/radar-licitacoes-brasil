import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const originalReadFileSync = fs.readFileSync;
const vividTheme = originalReadFileSync(new URL('./vivid-theme.css', import.meta.url), 'utf8');

fs.readFileSync = function patchedReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  if (value.endsWith('/app.html') || value.endsWith('\\app.html')) {
    const html = originalReadFileSync.call(fs, new URL('./app-professional.html', import.meta.url), 'utf8');
    return html.replace('</head>', `<style id="vivid-theme">${vividTheme}</style></head>`);
  }
  return originalReadFileSync.call(fs, path, ...args);
};

syncBuiltinESMExports();
await import('./server.mjs');
