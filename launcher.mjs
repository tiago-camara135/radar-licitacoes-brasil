import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';

const originalReadFileSync = fs.readFileSync;
const vividTheme = originalReadFileSync(new URL('./vivid-theme.css', import.meta.url), 'utf8');
const autoNotifyStyle = originalReadFileSync(new URL('./auto-notifications.css', import.meta.url), 'utf8');
const verifiedPncpScript = originalReadFileSync(new URL('./verified-pncp-links.js', import.meta.url), 'utf8');
const autoNotifyScript = originalReadFileSync(new URL('./auto-notifications.js', import.meta.url), 'utf8');
const radarOnlyAlertsScript = originalReadFileSync(new URL('./radar-only-alerts.js', import.meta.url), 'utf8');
const chamberFilterScript = originalReadFileSync(new URL('./chamber-filter.js', import.meta.url), 'utf8');

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="RLB">
<defs>
  <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#00b85c"/><stop offset="1" stop-color="#006b3c"/></linearGradient>
  <linearGradient id="y" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe44d"/><stop offset="1" stop-color="#f5b700"/></linearGradient>
  <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#126de0"/><stop offset="1" stop-color="#062f79"/></linearGradient>
  <filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".22"/></filter>
</defs>
<rect x="2" y="2" width="92" height="92" rx="20" fill="url(#g)"/>
<g opacity=".33" fill="none" stroke="#51f0a6" stroke-width="2.4" stroke-linecap="round"><path d="M14 35a36 36 0 0 1 20-20"/><path d="M62 14a36 36 0 0 1 20 20"/><path d="M82 62a36 36 0 0 1-20 20"/><path d="M34 82a36 36 0 0 1-20-20"/></g>
<path d="M48 13 85 48 48 83 11 48Z" fill="url(#y)" filter="url(#s)"/>
<circle cx="48" cy="48" r="28.5" fill="url(#b)"/>
<g fill="none" stroke="#64dcff" stroke-width="2.4" stroke-linecap="round" opacity=".9"><path d="M48 27a21 21 0 0 1 19 12"/><path d="M48 33a15 15 0 0 1 13.5 8.5"/><path d="M48 39a9 9 0 0 1 8 5"/></g>
<path d="M48 48 67 31a28 28 0 0 1 7 15Z" fill="#55f0d7" opacity=".28"/>
<circle cx="67" cy="31" r="2.5" fill="#fff"/>
<text x="48" y="56" text-anchor="middle" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="22" font-weight="900" letter-spacing="1">RLB</text>
<g transform="translate(38 60)" fill="none" stroke="#77ddff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M3 4h11l4 4v14H3Z"/><path d="M14 4v5h4"/><path d="M6 13h8M6 17h6"/><path d="M0 7h2M0 11h2M0 15h2"/></g>
</svg>`;
const iconData = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(iconSvg)}`;
const iconStyle = `
.brand-mark{width:58px!important;height:58px!important;border-radius:16px!important;overflow:hidden!important;background:transparent!important;box-shadow:0 10px 26px rgba(0,156,59,.24),0 4px 12px rgba(255,223,0,.18)!important;display:grid!important;place-items:center!important}
.brand-mark img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important;border-radius:16px!important}
@media(max-width:760px){.brand-mark{width:48px!important;height:48px!important;border-radius:14px!important}.brand-mark img{border-radius:14px!important}}`;

function applyBrand(html) {
  let out = String(html);
  out = out.replace(/<meta name="theme-color" content="[^"]*">/i, '<meta name="theme-color" content="#009C3B">');
  out = out.replace(/<div class="brand-mark" aria-hidden="true"><svg[\s\S]*?<\/svg><\/div>/, `<div class="brand-mark" aria-hidden="true"><img src="${iconData}" alt=""></div>`);
  out = out.replace('</head>', `<link rel="icon" type="image/svg+xml" href="${iconData}"><style id="vivid-theme">${vividTheme}</style><style id="rlb-icon-style">${iconStyle}</style><style id="auto-notification-style">${autoNotifyStyle}</style></head>`);
  out = out.replace('</body>', `<script id="verified-pncp-script">${verifiedPncpScript}</script><script id="chamber-filter-script">${chamberFilterScript}</script><script id="auto-notification-script">${autoNotifyScript}</script><script id="radar-only-alerts-script">${radarOnlyAlertsScript}</script></body>`);
  return out;
}

fs.readFileSync = function patchedReadFileSync(path, ...args) {
  const value = path instanceof URL ? path.pathname : String(path);
  if (value.endsWith('/app.html') || value.endsWith('\\app.html')) {
    const html = originalReadFileSync.call(fs, new URL('./app-professional.html', import.meta.url), 'utf8');
    return applyBrand(html);
  }
  return originalReadFileSync.call(fs, path, ...args);
};

syncBuiltinESMExports();
await import('./server.mjs');
