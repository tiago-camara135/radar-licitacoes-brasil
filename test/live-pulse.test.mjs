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


test('etapa 3: novas licitações vêm de comparação real entre snapshots, nunca da carga inicial',()=>{
 assert.match(js,/let recFilter='all',recCache=\[\],recInitialized=false/);
 assert.match(js,/if\(recInitialized\)\{/);
 assert.match(js,/if\(!before\.has\(key\)\)\{recPulse\.set\(key,'new'\)/);
 assert.match(js,/renderedRecSignature===signature&&target\.querySelector\('\.rev-recs-list'\)/);
 assert.match(js,/agendaInitialized=false,agendaSeen=new Map\(\)/);
 assert.match(js,/if\(agendaInitialized\)\{/);
 assert.match(js,/recentInitialized=false,recentSeen=new Map\(\)/);
 assert.match(js,/if\(recentInitialized\)\{/);
 assert.match(js,/radar:pulse-updates/);
 assert.match(css,/@keyframes rlbPulseEnter/);
 assert.match(css,/#view-home \.rlb-pulse-item\[data-pulse-state="new"\]/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(html,/id="rlbHomeNewUpdates"[^>]+aria-live="polite"/);
});


test('etapa 4: urgência usa datas reais e aderência usa score existente',()=>{
 assert.match(js,/remaining>=0&&remaining<=48\*3600000/);
 assert.match(js,/Number\(x\.fit\?\.score\)>=85/);
 assert.match(js,/card\.dataset\.priority=dueSoon\?'urgent':highFit\?'high-fit':'standard'/);
 assert.match(js,/const meter=el\('progress','rlb-fit-meter'\)/);
 assert.match(js,/meter\.value=Math\.round\(Math\.min\(100,Math\.max\(0,score\)\)\)/);
 assert.match(js,/row\.dataset\.urgency=diff<=1\?'critical':diff<=3\?'soon':'normal'/);
 assert.match(css,/#view-home \.rlb-priority-urgent/);
 assert.match(css,/#view-home \.rlb-fit-meter::-webkit-progress-value/);
 assert.match(css,/#view-home \.rlb-home-deadline\[data-urgency="critical"\]/);
});


test('estabilidade: urgência muda ao atravessar 48h/24h e não mistura contas',()=>{
 assert.match(js,/const urgencyTier=x=>\{/);
 assert.match(js,/remaining<=86400000\?'24h':remaining<=48\*3600000\?'48h':'normal'/);
 assert.match(js,/JSON\.stringify\(\[deadlinePeriod,today,events\.map/);
 assert.match(js,/agendaInitialized=false;agendaSeen\.clear\(\);agendaPulse\.clear\(\)/);
 assert.match(js,/recentInitialized=false;recentSeen\.clear\(\);recentPulse\.clear\(\)/);
 assert.match(js,/if\(noticeTimer\)clearTimeout\(noticeTimer\)/);
});
