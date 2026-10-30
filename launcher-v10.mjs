import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const nativeReadFileSync = fs.readFileSync.bind(fs);
const intelligenceCss = nativeReadFileSync(new URL('./theme-functional-v14.css', import.meta.url), 'utf8');
const intelligenceJs = nativeReadFileSync(new URL('./theme-functional-v14.js', import.meta.url), 'utf8');

fs.readFileSync = function rlbV10ReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  const html = nativeReadFileSync(path, ...args);
  if (typeof html !== 'string') return html;
  if (value.endsWith('/app-professional.html') || value.endsWith('\\app-professional.html')) {
    const finalLayer = `<script id="rlb-functional-v14-final">window.addEventListener('load',()=>{try{const old=document.getElementById('rlb-functional-v14-style');if(old)old.remove();const st=document.createElement('style');st.id='rlb-functional-v14-style';st.textContent=${JSON.stringify(intelligenceCss)};document.head.appendChild(st);${intelligenceJs}}catch(e){console.error('RLB functional V14 final:',e)}},{once:true});</script>`;
    return html.replace('</body>', `${finalLayer}</body>`);
  }
  return html;
};

syncBuiltinESMExports();
await import('./launcher-v9.mjs');
