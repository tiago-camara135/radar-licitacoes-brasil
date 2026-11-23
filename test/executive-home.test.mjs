import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../app-v2.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../app-v2.css',import.meta.url),'utf8');
const begin=html.indexOf('<section id="view-home"');
const end=html.indexOf('<section id="view-radar"',begin);
const home=begin>=0&&end>begin?html.slice(begin,end):'';

test('Visão Geral é uma página independente da busca avançada',()=>{
 assert.ok(begin>0&&end>begin,'home section precedes unchanged Radar section');
 assert.match(html, /id="rlbHomeNav" data-view="home" class="active"/);
 assert.match(html, /id="view-radar" class="view"/);
 assert.match(js,/show\('home'\);startLive\(\);startRadarDashboard\(\)/);
 assert.match(js,/home:\['Visão Geral'/);
 assert.doesNotMatch(home,/id="rlbHomeSearchForm"/);
 assert.match(home,/data-home-action="radar"/);
 assert.match(html,/id="radarSearchForm"/);
 assert.equal((html.match(/id="radarSearchForm"/g)||[]).length,1);
});

test('home usa dados existentes e não inventa contagens ou tendências',()=>{
 for(const x of ['rlbHomeKpis','rlbHomeRecommendations','rlbHomeDeadlines','rlbHomePanorama','rlbHomeRecent'])assert.match(home,new RegExp('id="'+x+'"'));
 assert.match(js,/radar:overview/);
 assert.match(js,/radar:live-feed/);
 assert.match(js,/const funnel=data\?\.funnel\|\|\{\}/);
 assert.match(js,/renderDeadlines\(overview\)/);
 assert.match(js,/renderRecent\(event\.detail\?\.items\)/);
 assert.match(js,/const statsSlot=\$\('#rlbHomeKpis'\)/);
 assert.match(js,/const homeSlot=\$\('#rlbHomeRecommendations'\)/);
 assert.doesNotMatch(home, /89%|347 novas|92% de aderência|crescimento de 24%/i);
});

test('pesquisa existe somente na página do Radar, com filtros essenciais sempre visíveis',()=>{
 const radar=html.slice(html.indexOf('<section id="view-radar"'));
 for(const id of ['searchKeyword','radarStatePicker','radarStates','searchModality','radarClosingDays','radarFiltersToggle','radarFilters'])assert.match(radar,new RegExp('id="'+id+'"'));
 assert.equal((html.match(/id="radarSearchForm"/g)||[]).length,1);
 assert.doesNotMatch(home,/<form|rlbHomeKeyword|rlbHomeSearchForm/);
 const bar=radar.slice(radar.indexOf('<div class="radar-search-bar">'),radar.indexOf('<div id="radarFilters"'));
 for(const id of ['searchKeyword','radarStatePicker','searchModality','radarClosingDays','radarFiltersToggle'])assert.match(bar,new RegExp('id="'+id+'"'));
 assert.match(js,/form\.addEventListener\('change', renderDashboardChips\)/);
 assert.match(js,/const states = selectedRadarStates\(\)/);
 assert.match(js,/picker\.open = false/);
 assert.doesNotMatch(js,/function setupSearch\(\)/);
 assert.match(js,/function setupHomeActions\(\)/);
});

test('layout tem hierarquia visual e tema claro/escuro, incluindo dispositivos móveis',()=>{
 assert.match(css,/RLB Executive Home v1/);
 assert.match(css,/#view-home \.rlb-home-main-grid/);
 assert.match(css,/#view-home \.rlb-home-deadline-list/);
 assert.match(css,/#view-home \.rlb-home-quick-grid/);
 assert.match(css,/#view-home \.rlb-home-recent-list/);
 assert.match(css,/html\[data-theme="dark"\] #view-home/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/@media\(max-width:500px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('links oficiais não aceitam javascript e os textos são renderizados como texto',()=>{
 assert.match(js,/const safeUrl=raw=>\{try\{const u=new URL\(raw\);return u.protocol==='https:'/);
 assert.match(js,/const n=document.createElement\(tag\)/);
 assert.match(js,/n\.textContent=String\(value\)/);
 assert.match(js,/a\.rel='noopener noreferrer'/);
 assert.match(js,/Nenhum prazo registrado nos próximos/);
});


test('auditoria: home é atualizada por eventos de monitoramento nacional',()=>{
 assert.match(js,/state\.view==='radar'\|\|state\.view==='home'/);
 assert.match(js,/document\.dispatchEvent\(new CustomEvent\('radar:live-feed'/);
});
test('auditoria: filtros detalhados permanecem na mesma pesquisa, sem redirecionamentos',()=>{
 const filters=html.slice(html.indexOf('<div id="radarFilters"'),html.indexOf('<div class="radar-filter-bar">'));
 for(const id of ['radarMunicipality','radarOrganization','searchDays'])assert.match(filters,new RegExp('id="'+id+'"'));
 assert.match(js,/form\.addEventListener\('submit', event => \{/);
 assert.match(js,/runDashboardSearch\(\)/);
 assert.match(js,/\$\('#radarFiltersToggle'\)\.addEventListener\('click'/);
});
test('auditoria: Minha Operação sincroniza indicadores no dashboard',()=>{
 assert.match(js,/overview=d;render\(\);installTrackActions\(\);document\.dispatchEvent\(new CustomEvent\('radar:overview'/);
 assert.match(js,/document\.addEventListener\('radar:overview',event=>\{/);
 assert.match(js,/renderMetric\(ui\.values\[i\],metrics\[key\]\)/);
});


test('navegação abre áreas no topo e inclui retorno contextual sem rotas duplicadas',()=>{
 assert.match(html,/id="rlbPageNavBar"/);
 assert.match(html,/id="rlbPageNavCurrent"/);
 assert.match(html,/class="rlb-page-back" data-view="home"/);
 assert.match(js,/const previous=state\.view,changed=previous!==v/);
 assert.match(js,/const breadcrumb=\$\('#rlbPageNavBar'\)/);
 assert.match(js,/window\.scrollTo\(0,0\)/);
 assert.match(js,/requestAnimationFrame\(resetPosition\)/);
 assert.match(js,/target\.classList\.add\('rlb-view-enter'\)/);
 assert.match(css,/@keyframes rlbPageReveal/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});

test('indicadores são botões que abrem ações reais sem gerar valores fictícios',()=>{
 assert.match(js,/const m=el\('button','rev-stat'\)/);
 assert.match(js,/m\.dataset\.homeAction=action/);
 assert.match(js,/if\(\['today','high'\]\.includes\(action\)\)/);
 assert.match(js,/radar:home-rec-filter/);
 assert.match(js,/radar:operation-filter/);
 assert.match(js,/radar:operation-focus/);
 assert.match(css,/#view-home \.rev-kpi-arrow/);
});

test('filtros de recomendações continuam vinculados à licitação correta',()=>{
 for(const name of ['rlbHomeRecommendationFilters','rlbHomeDeadlineControls','rlbHomeRecentFilters','rlbHomeFeedStatus'])assert.match(home,new RegExp('id="'+name+'"'));
 assert.match(js,/recFilter='all',recCache=\[\]/);
 assert.match(js,/if\(recFilter==='high'\)return Number\(x\.fit\?\.score\)>=85/);
 assert.match(js,/if\(recFilter==='soon'\)/);
 assert.match(js,/radar:recommendations-rendered/);
 assert.match(js,/card\.dataset\.cnpj=String\(x\.org_cnpj\|\|''\)/);
 assert.match(js,/b\.dataset\.cnpj=card\.dataset\.cnpj/);
});

test('agenda 7 ou 30 dias, feed vigente e estágios do gráfico são filtros funcionais',()=>{
 assert.match(js,/deadlinePeriod=7,feedFilter='all',liveCache=\[\]/);
 assert.match(js,/deadlinePeriod=next;setActive\('data-home-period',next\)/);
 assert.match(js,/feedFilter=next;setActive\('data-home-feed',next\)/);
 assert.match(js,/const funnel=data\?\.funnel\|\|\{\}/);
 assert.match(js,/item\.dataset\.homeStage=g\.status/);
 assert.match(js,/if\(filter==='preparing'\)/);
 assert.match(js,/calendar-focused/);
 assert.match(css,/#view-operation\.calendar-focused \.rev-op-layout/);
});

test('troca de telas não chama forEach em querySelector de elemento único',()=>{
 assert.match(js,/document\.querySelectorAll\('\.view'\)\.forEach/);
 assert.match(js,/document\.querySelectorAll\('#mainNav \[data-view\]'\)\.forEach/);
});


test('refinamento visual evita contornos azuis automáticos e preserva foco por teclado',()=>{
 assert.doesNotMatch(js,/if\(name==='radar'\)\$\('#searchKeyword'\)\?\.focus\(/);
 assert.doesNotMatch(js,/if\(name==='alerts'\)\$\('#alertName'\)\?\.focus\(/);
 assert.match(html,/id="rlbPageNavCurrent" aria-current="page" aria-live="polite"/);
 assert.match(css,/Radar UX refinado · navegação limpa/);
 assert.match(css,/#appShell :is\(#rlbPageNavCurrent,#pageTitle,#rlbHomeTitle,#radarResultsTitle\)\[tabindex="-1"\]:focus/);
 assert.match(css,/#appShell\.radar-layout :is\(button,a,select,summary\):focus-visible/);
 assert.match(css,/#appShell #view-radar #radarSearchForm \.radar-search-bar \.rlb-radar-keyword:focus-within/);
 assert.match(css,/#appShell #view-radar \.radar-search-bar #searchKeyword:focus-visible/);
});


test('layout adaptado mantém os filtros essenciais no Radar nos temas e telas pequenas',()=>{
 assert.match(css,/Radar · página única de pesquisa/);
 assert.match(css,/#appShell #view-radar #radarSearchForm \.radar-search-bar/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.rlb-radar-search-heading/);
 assert.match(html,/id="rlbRadarSearchTitle"/);
 assert.doesNotMatch(home,/radar-search-bar|rlb-home-search/);
});
