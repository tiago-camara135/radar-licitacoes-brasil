// Shared, bounded transport for the official PNCP consultation endpoints.
export function createPncpTransport({fetcher=(...args)=>fetch(...args),now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),spacing=450,maxConcurrent=2,maxRetries=2,timeoutMs=18000,cacheMs=20000,maxQueue=96}={}){
 const inflight=new Map(),cache=new Map(),queue=[];
 let active=0,gate=Promise.resolve(),nextStart=0,cooldown=0,penalty=0;
 const counters={requests:0,successes:0,failures:0,retries:0,rate_limited:0,deduplicated:0,cache_hits:0};
 const error=(message,status,retryable=false)=>Object.assign(new Error(message),{status,retryable});
 function retryAfter(response,attempt){
  const raw=response?.headers?.get?.('retry-after');
  if(raw){const seconds=Number(raw),date=Date.parse(raw);const ms=Number.isFinite(seconds)?seconds*1000:date-now();if(Number.isFinite(ms)&&ms>0)return ms;}
  return Math.min(1500*2**attempt,12000);
 }
 async function turn(){
  const step=gate.then(async()=>{
   while(true){const wait=Math.max(0,nextStart-now(),cooldown-now());if(!wait)break;await sleep(wait);}
   nextStart=now()+spacing+penalty;
  });
  gate=step.catch(()=>{});await step;
 }
 function pump(){
  while(active<maxConcurrent&&queue.length){
   const {job,resolve,reject}=queue.shift();active++;
   Promise.resolve().then(job).then(resolve,reject).finally(()=>{active--;pump()});
  }
 }
 function enqueue(job){
  if(queue.length>=maxQueue)return Promise.reject(error('Fila PNCP ocupada; nova tentativa no próximo ciclo',503,true));
  return new Promise((resolve,reject)=>{queue.push({job,resolve,reject});pump()});
 }
 async function attemptRequest(url,attempt){
  await turn();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  counters.requests++;
  try{
   const response=await fetcher(url,{headers:{accept:'application/json','user-agent':'RadarLicitacoesBrasil/4.2'},signal:controller.signal});
   if(response.status===204){counters.successes++;penalty=Math.max(0,penalty-100);return {response,body:{data:[],totalPaginas:0,totalRegistros:0}};}
   let body;
   try{body=await response.json()}catch{if(response.ok)throw error('PNCP retornou JSON inválido',502,true);body=null;}
   if(!response.ok){
    const transient=response.status===429||response.status>=500||response.status===408;
    if(response.status===429)counters.rate_limited++;
    if(transient){penalty=Math.min(2500,penalty+350);cooldown=Math.max(cooldown,now()+retryAfter(response,attempt));}
    throw error('PNCP HTTP '+response.status,response.status,transient);
   }
   if(!Array.isArray(body)&&!Array.isArray(body?.data))throw error('PNCP retornou resposta sem lista de registros',502,true);
   counters.successes++;penalty=Math.max(0,penalty-100);
   return {response,body};
  }catch(e){
   counters.failures++;
   if(e?.name==='AbortError'||e instanceof TypeError||e.retryable){
    if(!e.status||e.status===502){penalty=Math.min(2500,penalty+250);cooldown=Math.max(cooldown,now()+Math.min(1000*2**attempt,8000));}
    e.retryable=true;
   }
   throw e;
  }finally{clearTimeout(timer)}
 }
 async function request(url){
  let last;
  for(let attempt=0;attempt<=maxRetries;attempt++){
   try{return await enqueue(()=>attemptRequest(url,attempt))}
   catch(e){last=e;if(!e.retryable||attempt===maxRetries)throw e;counters.retries++;}
  }
  throw last;
 }
 function get(url){
  const key=String(url),hit=cache.get(key);
  if(hit&&now()-hit.at<cacheMs){counters.cache_hits++;return Promise.resolve(hit.value);}
  if(hit)cache.delete(key);
  if(inflight.has(key)){counters.deduplicated++;return inflight.get(key);}
  const task=request(key).then(value=>{
   cache.set(key,{at:now(),value});
   while(cache.size>128)cache.delete(cache.keys().next().value);
   return value;
  }).finally(()=>inflight.delete(key));
  inflight.set(key,task);return task;
 }
 return {get,health:()=>({...counters,active,queued:queue.length,inflight:inflight.size,request_spacing_ms:spacing+penalty,cooldown_until:cooldown>now()?new Date(cooldown).toISOString():null,max_concurrent:maxConcurrent})};
}
