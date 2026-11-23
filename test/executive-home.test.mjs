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
 assert.match(home,/id="rlbHomeSearchForm"/);
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

test('busca da Visão Geral preserva filtros e reaproveita a busca completa',()=>{
 for(const id of ['rlbHomeKeyword','rlbHomeUf','rlbHomeModality','rlbHomeClosingDays','rlbHomeAdvanced'])assert.match(home,new RegExp('id="'+id+'"'));
 assert.match(js,/querySelectorAll\(selector\)/);
 assert.match(js, /#radarSearchForm'\)\?\.requestSubmit\(\)/);
 assert.match(js, /c\.checked=Boolean\(uf\.value\)&&c\.value===uf\.value/);
 assert.match(js, /if\(deadline\)deadline\.value=\$\('#rlbHomeClosingDays'\)\.value/);
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
 assert.match(js,/Nenhum prazo futuro registrado/);
});
