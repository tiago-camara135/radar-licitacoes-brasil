import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('notification list releases loading lock before slow count completes',async()=>{
 const s=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
 const ctx=vm.createContext({logged:()=>true,loading:false,markingAll:false,epoch:0,rows:[],ui:{mark:{},message:{},list:{}},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,json:async()=>({items:[]})}),render:()=>{},profile:()=>new Promise(()=>{})});
 vm.runInContext(s.slice(s.indexOf('async function load(){',s.indexOf('let rows=[],filter=')),s.indexOf('function render(){',s.indexOf('let rows=[],filter=')))+';this.load=load;',ctx);
 await ctx.load();assert.equal(ctx.loading,false);assert.equal(ctx.ui.mark.disabled,false);
});
