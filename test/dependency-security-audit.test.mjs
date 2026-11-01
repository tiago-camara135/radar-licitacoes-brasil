import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('npm audit sem vulnerabilidades high/critical em produção',()=>{
  let out='';
  try{
    out=execFileSync('npm',['audit','--omit=dev','--json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  }catch(error){
    out=String(error.stdout||'');
  }
  assert.ok(out,'npm audit não retornou JSON');
  const data=JSON.parse(out);
  const v=data.metadata?.vulnerabilities||{};
  console.log('DEPENDENCY_AUDIT_RESULT='+JSON.stringify(v));
  assert.equal(Number(v.critical||0),0,`Vulnerabilidades críticas: ${v.critical}`);
  assert.equal(Number(v.high||0),0,`Vulnerabilidades altas: ${v.high}`);
});
