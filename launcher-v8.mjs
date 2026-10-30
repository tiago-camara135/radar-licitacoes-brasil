import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { initAdminSelfHeal } from './admin-selfheal.mjs';
import { initNotificationPolicyV3 } from './notification-policy-v3.mjs';

const nativeReadFileSync = fs.readFileSync.bind(fs);
const notificationCss = nativeReadFileSync(new URL('./notifications-v1.css', import.meta.url), 'utf8');
const notificationJs = nativeReadFileSync(new URL('./notifications-v3.js', import.meta.url), 'utf8');
const navigationRecoveryCss = nativeReadFileSync(new URL('./navigation-recovery.css', import.meta.url), 'utf8');
const navigationRecoveryJs = nativeReadFileSync(new URL('./navigation-recovery.js', import.meta.url), 'utf8');
const userAccessJs = nativeReadFileSync(new URL('./user-access-v1.js', import.meta.url), 'utf8');
const experienceV10Css = nativeReadFileSync(new URL('./experience-v10.css', import.meta.url), 'utf8');
const experienceV10Js = nativeReadFileSync(new URL('./experience-v10.js', import.meta.url), 'utf8');
const intelligenceFunctionalV13Js = nativeReadFileSync(new URL('./intelligence-functional-v13.js', import.meta.url), 'utf8');

fs.readFileSync = function rlbV8ReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  const html = nativeReadFileSync(path, ...args);
  if (typeof html !== 'string') return html;
  if (value.endsWith('/app-professional.html') || value.endsWith('\\app-professional.html')) {
    const cssTag = `<style id="rlb-notifications-v9">${notificationCss}</style><style id="rlb-navigation-recovery">${navigationRecoveryCss}</style><style id="rlb-experience-v10">${experienceV10Css}</style>`;
    const delayedScript = `<script id="rlb-notifications-v9-script">window.addEventListener('load',()=>{try{${notificationJs}}catch(e){console.error('RLB notifications UI V3:',e)}},{once:true});</script><script id="rlb-navigation-recovery-script">window.addEventListener('load',()=>{try{${navigationRecoveryJs}}catch(e){console.error('RLB navigation recovery:',e)}},{once:true});</script><script id="rlb-user-access-v1-script">window.addEventListener('load',()=>{try{${userAccessJs}}catch(e){console.error('RLB shared user access:',e)}},{once:true});</script><script id="rlb-experience-v10-script">window.addEventListener('load',()=>{try{${experienceV10Js}}catch(e){console.error('RLB experience V10:',e)}},{once:true});</script><script id="rlb-intelligence-functional-v13-script">window.addEventListener('load',()=>{try{${intelligenceFunctionalV13Js}}catch(e){console.error('RLB intelligence functional V13:',e)}},{once:true});</script>`;
    return html
      .replace('</head>', `${cssTag}</head>`)
      .replace('</body>', `${delayedScript}</body>`);
  }
  return html;
};

syncBuiltinESMExports();
await import('./launcher-v7.mjs');
await initNotificationPolicyV3();
await initAdminSelfHeal();
