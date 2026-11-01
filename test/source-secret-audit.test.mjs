import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const self='test/source-secret-audit.test.mjs';
const allowed=new Set(['.github/workflows/stability-check.yml']);
const patterns=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['openai-key',/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['google-key',/\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['resend-key',/\bre_[A-Za-z0-9_-]{20,}\b/],
  ['database-url',/postgres(?:ql)?:\/\/[^\s:'"`]+:[^\s@'"`]+@[^\s'"`]+/i]
];

test('repositório atual não contém segredo evidente em texto puro',()=>{
  const files=execFileSync('git',['ls-files'],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
  const findings=[];
  for(const file of files){
    if(file===self||allowed.has(file)||file.endsWith('.png')||file.endsWith('.jpg')||file.endsWith('.jpeg')||file.endsWith('.zip'))continue;
    let text='';try{text=fs.readFileSync(file,'utf8')}catch{continue}
    for(const [name,re] of patterns){
      if(re.test(text))findings.push({file,type:name});
    }
  }
  console.log('SECRET_SCAN_RESULT='+JSON.stringify(findings));
  assert.deepEqual(findings,[],'Possível segredo em texto puro no repositório atual');
});
