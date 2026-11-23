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
