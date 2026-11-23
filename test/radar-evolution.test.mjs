import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');
test('dashboard compacto usa indicadores reais da conta',()=>{
 for(const term of ['/api/dashboard/overview','new_matches_today','recommended_high','tracked_active','upcoming_7d','AbortController()','credentials:\'same-origin\''])assert.ok(js.includes(term),term);
 assert.match(js,/ui\.values\[i\]\.textContent=number\(m\[k\]\)/);
});
test('dashboard acompanha tokens do tema e telas pequenas',()=>{
 assert.match(css,/\.rev-grid/);
 assert.match(css,/var\(--radar-paper/);
 assert.match(css,/@media\(max-width:760px\)/);
});


test('central usa entregas existentes e permite reconhecer alertas lidos',()=>{
 for(const term of ['/api/notifications/profile','/api/notifications/deliveries?limit=100','/api/notifications/read-all',"x.channel==='onsite'",'payload.pncp_url','read_at','safeUrl'])assert.ok(js.includes(term),term);
 assert.match(css,/\.rev-n-panel/);
});
test('pontuações vêm do backend, com justificativas e ressalvas',()=>{
 assert.match(js,/radar:overview/);
 assert.match(js,/x\.fit\?\.score/);
 assert.match(js,/x\.fit\?\.reasons/);
 assert.match(js,/não representa chance de vencer/);
});
