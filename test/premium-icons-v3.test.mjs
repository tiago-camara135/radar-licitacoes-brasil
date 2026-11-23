import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('app-v2.css'),html=read('app-v2.html'),app=read('app-v2.js'),auth=read('auth-home-v1.js'),corp=read('corporate-ui-v3.js');
test('premium icons cover existing navigation, without changing routes',()=>{
 for(const name of ["home","radar","operation","saved","saved-searches","alerts","habilitation","documents","admin"])assert.ok(css.includes('#mainNav [data-view="'+name+'"]'));
 assert.ok(css.includes('.nav-icon::after'));assert.ok(css.includes('.nav-icon>svg'));
});
test('two variants of every SVG icon are embedded and well formed',()=>{
 for(const name of ["home","radar","gavel","chart","star","calendar","bell","document","gear","search","user","shield","layers","pin","external","eye","check","vehicle","electric","health","tools","sun","moon","logout","download","ai","support","legal","lock","mail","menu","back","info","calendarAmber"]){
  const prefix='--rp-icon-'+name+':url("data:image/svg+xml,';
  const assets=css.split(prefix).slice(1).map(s=>decodeURIComponent(s.split('")')[0]));
  assert.equal(assets.length,2,name);assert.notEqual(assets[0],assets[1],name);
  for(const asset of assets){assert.match(asset,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 24 24">/);assert.match(asset,/<linearGradient/);assert.ok(asset.endsWith('</svg>'))}
 }
});
test('login and internal icons use the same premium palette, refresh remains interactive',()=>{
 for(const name of ['radar','bell','ai','support','legal','document','search','shield'])assert.ok(auth.includes('data-rp-icon="'+name+'"'));
 for(const name of ['download','external','star','document'])assert.ok(app.includes('data-rp-icon="'+name+'"'));
 assert.ok(corp.includes('data-rp-icon="moon"'));assert.ok(css.includes('svg[hidden]{display:none!important}'));
 assert.match(html,/id="rlbHomeRefresh"[^>]*aria-label=/);assert.match(app,/requestDashboardRefresh/);
 assert.match(html,/pulse-desktop-radar2-icons3/);
});
