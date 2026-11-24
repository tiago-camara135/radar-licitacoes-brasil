import test from 'node:test';
import assert from 'node:assert/strict';
import {__test} from '../user-dashboard-v1.mjs';
import fs from 'node:fs';
const {fitFor}=__test;
const row={object_text:'Aquisição de pneus para frota',uf:'RN'};
const geo={scope:'ufs',ufs:['RN']};
test('specific documented alert scores above broad alert without claiming eligibility',()=>{
 const broad=fitFor({...row,matched_criteria:[{name:'Tudo'}]},{score:100},geo,['Tudo']);
 const specific=fitFor({...row,matched_criteria:[{name:'Pneus',keyword:'pneus',uf:'RN'}]},{score:100},geo,['Pneus']);
 assert.ok(broad.score<85);assert.equal(specific.score,100);
 assert.equal(specific.components.reduce((a,x)=>a+x.points,0),specific.score);
 assert.match(specific.limitations,/Não comprova habilitação/);
});
test('missing docs reduce the score, repeated alerts do not artificially inflate it',()=>{
 const criteria={keyword:'pneus',uf:'RN'};
 const complete=fitFor({...row,matched_criteria:[criteria]},{score:100},geo,['Pneus']);
 const repeated=fitFor({...row,matched_criteria:[criteria,criteria]},{score:0},geo,['Pneus','Pneus 2']);
 assert.equal(repeated.score,complete.score-25);
});
test('CRM uses current tracking records, preserved list and real update API',()=>{
 const s=fs.readFileSync(new URL('../app-v2.js',import.meta.url),'utf8');
 assert.match(s,/if\(operationMode==='board'&&visible.length\)/);
 assert.match(s,/dest.append\(card\);updateBoardCounts\(board\)/);
 assert.match(s,/api\/dashboard\/tracking/);
 assert.match(s,/rp-fit-details/);
});
