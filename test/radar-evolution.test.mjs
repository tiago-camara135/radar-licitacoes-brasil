import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const js=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');
test('dashboard compacto usa indicadores reais da conta',()=>{
 for(const term of ['/api/dashboard/overview','new_matches_today','recommended_high','tracked_active','upcoming_7d','AbortController()','credentials:\'same-origin\''])assert.ok(js.includes(term),term);
 assert.match(js,/renderMetric\(ui\.values\[i\],m\[k\]\)/);
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
 assert.match(fs.readFileSync(new URL('../app-v2.html',import.meta.url),'utf8'),/não representa probabilidade de vencer/);
});


test('acompanhamento e calendário usam rotas autenticadas existentes',()=>{
 for(const term of ['view-operation','/api/dashboard/tracking','/api/dashboard/overview','notes:notes.value','status:s.value','America/Fortaleza','data-rev-track'])assert.ok(js.includes(term),term);
 assert.match(css,/\.rev-op-layout/);
 assert.match(css,/\.rev-cal-grid/);
 assert.match(css,/@media\(max-width:900px\)/);
});
test('backend permite limpar anotações sem excluir licitações',()=>{
 const backend=fs.readFileSync(new URL('../user-dashboard-v1.mjs',import.meta.url),'utf8');
 assert.match(backend,/b\.notes===undefined\?null:clean\(b\.notes,1500\)/);
 assert.match(backend,/WHERE t\.user_id=\$1/);
 assert.match(backend,/ON CONFLICT\(user_id,pncp_key\)/);
});


test('respostas atrasadas não reexpõem dados após logout',()=>{
 assert.match(js,/requestEpoch!==epoch/);
 assert.match(js,/generation\+\+/);
 assert.match(js,/revRecommendations.*remove/);
});
test('saúde administrativa é consultada por demanda, sem serviços pagos',()=>{
 assert.match(js,/Radar Evolution — Etapa 4/);
 assert.match(js,/\/api\/health/);
 assert.match(js,/id='revHealth'/);
 assert.match(css,/\.rev-health-status/);
 assert.match(css, /focus-visible/);
 assert.match(css, /prefers-reduced-motion:reduce/);
});


test('evolução fica antes do marcador removido pelo runtime antigo',()=>{
 const marker="\n\n(()=>{\n'use strict';\nconst CHECK_MS=5*60*1000;";
 const stage=js.indexOf('/* Radar Evolution — Etapa 1');
 const cutoff=js.indexOf(marker);
 assert.ok(stage>0&&cutoff>stage,'componentes devem entrar no bundle antes do corte legado');
});


test('IA-RLB widget opens visibly without depending on the URL hash',()=>{
 const drag=fs.readFileSync(new URL('../draggable-ai-v1.js',import.meta.url),'utf8');
 assert.match(drag,/classList\.add\('ai-widget-open'\)/);
 assert.match(css,/#appShell #ai-assistant\.ai-widget-open/);
 assert.match(css,/#appShell \.ai-fab\.ai-widget-fab-hidden/);
});


test('sino de notificações continua acessível em telas pequenas',()=>{
 assert.match(css, /max-width:760px/);
 assert.match(css, /topbar\.rev-n-wrap|topbar \.rev-n-wrap/);
 assert.match(css, /\.rev-n-bell::before/);
});


test('admin diagnostic survives dynamic Admin Center rerender',()=>{
 assert.match(js,/panelRepairScheduled/);
 assert.match(js,/observe\(admin,\{childList:true,subtree:true\}\)/);
 assert.match(js,/if\(admin\.classList\.contains\('active'\)&&!loading\)check\(\)/);
});
