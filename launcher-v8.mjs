import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { initAdminSelfHeal } from './admin-selfheal.mjs';

const nativeReadFileSync = fs.readFileSync.bind(fs);
const notificationCss = nativeReadFileSync(new URL('./notifications-v1.css', import.meta.url), 'utf8');
const notificationJs = nativeReadFileSync(new URL('./notifications-v2.js', import.meta.url), 'utf8');
const navigationRecoveryCss = nativeReadFileSync(new URL('./navigation-recovery.css', import.meta.url), 'utf8');
const navigationRecoveryJs = nativeReadFileSync(new URL('./navigation-recovery.js', import.meta.url), 'utf8');

fs.readFileSync = function rlbV8ReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  const html = nativeReadFileSync(path, ...args);
  if (typeof html !== 'string') return html;
  if (value.endsWith('/app-professional.html') || value.endsWith('\\app-professional.html')) {
    const cssTag = `<style id="rlb-notifications-v8">${notificationCss}</style><style id="rlb-navigation-recovery">${navigationRecoveryCss}</style>`;
    const delayedScript = `<script id="rlb-notifications-v8-script">window.addEventListener('load',()=>{try{${notificationJs}}catch(e){console.error('RLB notifications UI:',e)}},{once:true});</script><script id="rlb-navigation-recovery-script">window.addEventListener('load',()=>{try{${navigationRecoveryJs}}catch(e){console.error('RLB navigation recovery:',e)}},{once:true});</script>`;
    return html
      .replace('</head>', `${cssTag}</head>`)
      .replace('</body>', `${delayedScript}</body>`);
  }
  return html;
};

syncBuiltinESMExports();
await import('./launcher-v7.mjs');
await initAdminSelfHeal();
