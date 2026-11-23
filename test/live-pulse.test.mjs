import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../app-v2.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');

test('etapa 1: identidade visual premium adicionada sem remover home e busca',()=>{
 for(const id of ['rlbHomeLiveBar','rlbHomeLiveLabel','rlbHomeLastUpdate','rlbHomeNextUpdate','rlbHomeRefresh','rlbHomeNewUpdates','rlbHomeRecommendations','rlbHomeDeadlines']){
   assert.match(html,new RegExp('id="'+id+'"'),id);
 }
 assert.match(html, /id="view-home"/);
 assert.match(html, /id="radarSearchForm"/);
 assert.doesNotMatch(html, /id="rlbHomeSearchForm"/);
 assert.match(css,/Radar Pulse • painel executivo premium/);
 assert.match(css,/#view-home #rlbHomeRecommendations \.rev-rec/);
 assert.match(css,/#view-home \.rlb-live-bar/);
 assert.match(css,/html\[data-theme="dark"\] #view-home/);
 assert.match(css,/@media\(max-width:460px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});


test('etapa 2: polling real do dashboard a cada cinco minutos, sem inventar licitações',()=>{
 assert.match(js,/const DASHBOARD_REFRESH_MS=5\*60\*1000/);
 assert.match(js,/setInterval\(syncDashboardRefreshClock,1000\)/);
 assert.match(js,/if\(!logged\(\)\|\|document\.hidden\)return/);
 assert.match(js,/nextDashboardRefresh=lastDashboardRefreshAttempt\+DASHBOARD_REFRESH_MS/);
 assert.match(js,/radar:overview-refresh-request/);
 assert.match(js,/radar:live-refresh-request/);
 assert.match(js,/refreshLive\(\); \/\/ Consulta dados monitorados/);
 assert.match(js,/credentials:'same-origin',cache:'no-store'/);
 assert.match(html,/id="rlbHomeLastUpdate"/);
 assert.match(html,/id="rlbHomeNextUpdate"/);
 assert.match(js,/setAttribute\('aria-busy','true'\)/);
});
