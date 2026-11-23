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
