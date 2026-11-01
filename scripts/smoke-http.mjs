const base=String(process.env.RLB_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const checks=[
  ['/',200,'Radar de Licitações Brasil'],
  ['/api/health',200,'ok'],
  ['/api/stability/health',200,'2.10.1'],
  ['/assets/stability-ui-v1.js',200,'__rlbStabilityUiV1']
];
let failed=0;
for(const [path,status,needle] of checks){
  try{const r=await fetch(base+path,{headers:{accept:path.endsWith('.js')?'application/javascript':'*/*'}});const text=await r.text();const ok=r.status===status&&text.includes(needle);console.log(`${ok?'PASS':'FAIL'} ${path} status=${r.status}`);if(!ok)failed++}catch(e){console.log(`FAIL ${path} ${e.message}`);failed++}
}
if(failed)process.exitCode=1;
