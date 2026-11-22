import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePncpErrors } from '../pncp-client-v3.mjs';
import fs from 'node:fs';

test('PNCP modality diagnostics classify rate limits, upstream failures and timeouts without exposing messages',()=>{
  const result=summarizePncpErrors([
    {code:1,status:429,message:'PNCP HTTP 429: Too many requests'},
    {code:3,status:503,message:'PNCP HTTP 503: Service unavailable'},
    {code:7,status:400,message:'PNCP HTTP 400: Invalid parameter'},
    {code:12,status:null,message:'The operation was aborted due to timeout'}
  ]);
  assert.deepEqual(result,[
    {modality:1,status:429,category:'rate_limit'},
    {modality:3,status:503,category:'upstream_5xx'},
    {modality:7,status:400,category:'http_error'},
    {modality:12,status:null,category:'timeout'}
  ]);
});

test('live monitor and authenticated search status expose modality codes only',()=>{
  const live=fs.readFileSync(new URL('../live-monitor-v5.mjs',import.meta.url),'utf8');
  const search=fs.readFileSync(new URL('../search-router-v3.mjs',import.meta.url),'utf8');
  assert.match(live,/last_failed_details:lastFailedDetails.map/);
  assert.match(live,/failed_codes=/);
  assert.match(search,/error_details:summarizePncpErrors/);
  assert.match(search,/failed_codes=/);
});
