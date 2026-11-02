const DEFAULT_MAX_BYTES=5*1024*1024;
const DEFAULT_MAX_ENTRIES=80;
const DEFAULT_TTL_DAYS=30;

export function pncpDocumentCacheKey(ids){
  if(!ids||!/^\d{14}$/.test(String(ids.cnpj||''))||!Number.isInteger(Number(ids.year))||!Number.isInteger(Number(ids.sequence)))return null;
  if(ids.kind==='file'&&Number.isInteger(Number(ids.documentSequence)))return `${ids.cnpj}:${Number(ids.year)}:${Number(ids.sequence)}:file:${Number(ids.documentSequence)}`;
  if(ids.kind==='list')return `${ids.cnpj}:${Number(ids.year)}:${Number(ids.sequence)}:list`;
  return null;
}

export function createPncpDocumentCache(pool,options={}){
  const maxBytes=Math.max(64*1024,Number(options.maxBytes||DEFAULT_MAX_BYTES));
  const maxEntries=Math.max(10,Number(options.maxEntries||DEFAULT_MAX_ENTRIES));
  const ttlDays=Math.max(1,Number(options.ttlDays||DEFAULT_TTL_DAYS));
  const logger=options.logger||console;
  let initialized=false;

  async function init(){
    if(!pool||initialized)return;
    await pool.query(`CREATE TABLE IF NOT EXISTS pncp_document_response_cache(
      cache_key TEXT PRIMARY KEY,
      org_cnpj TEXT NOT NULL,
      year INTEGER NOT NULL,
      sequence INTEGER NOT NULL,
      document_sequence INTEGER,
      kind TEXT NOT NULL CHECK(kind IN ('list','file')),
      content_type TEXT,
      source_url TEXT,
      body BYTEA NOT NULL,
      body_bytes INTEGER NOT NULL,
      cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_pncp_document_cache_cached_at ON pncp_document_response_cache(cached_at DESC)');
    initialized=true;
  }

  async function get(ids){
    const key=pncpDocumentCacheKey(ids);if(!pool||!key)return null;
    try{
      await init();
      const cutoff=new Date(Date.now()-ttlDays*86400000);
      const r=await pool.query('SELECT body,content_type,source_url,cached_at,body_bytes FROM pncp_document_response_cache WHERE cache_key=$1 AND cached_at >= $2 LIMIT 1',[key,cutoff]);
      const row=r.rows[0];if(!row)return null;
      const body=Buffer.isBuffer(row.body)?row.body:Buffer.from(row.body||'');
      return new Response(body,{status:200,headers:{'content-type':row.content_type||'application/octet-stream','content-length':String(body.length),'x-rlb-source':'pncp-cache','x-rlb-cache-age':String(Math.max(0,Math.floor((Date.now()-new Date(row.cached_at).getTime())/1000)))}});
    }catch(error){logger?.warn?.('pncp document cache read:',String(error?.code||error?.message||error));return null}
  }

  async function save(ids,response,sourceUrl=''){
    const key=pncpDocumentCacheKey(ids);if(!pool||!key||!response?.ok)return false;
    try{
      const declared=Number(response.headers?.get?.('content-length')||0);if(declared>maxBytes)return false;
      const clone=response.clone(),ab=await clone.arrayBuffer();if(ab.byteLength===0||ab.byteLength>maxBytes)return false;
      await init();
      const ct=String(response.headers?.get?.('content-type')||'application/octet-stream').slice(0,250);
      const url=String(sourceUrl||response.url||'').slice(0,2200);
      await pool.query(`INSERT INTO pncp_document_response_cache(cache_key,org_cnpj,year,sequence,document_sequence,kind,content_type,source_url,body,body_bytes,cached_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT(cache_key) DO UPDATE SET content_type=EXCLUDED.content_type,source_url=EXCLUDED.source_url,body=EXCLUDED.body,body_bytes=EXCLUDED.body_bytes,cached_at=NOW()`,
        [key,String(ids.cnpj),Number(ids.year),Number(ids.sequence),ids.kind==='file'?Number(ids.documentSequence):null,ids.kind,ct,url,Buffer.from(ab),ab.byteLength]);
      await pool.query(`DELETE FROM pncp_document_response_cache WHERE cache_key IN (
        SELECT cache_key FROM pncp_document_response_cache ORDER BY cached_at DESC OFFSET $1
      )`,[maxEntries]);
      return true;
    }catch(error){logger?.warn?.('pncp document cache write:',String(error?.code||error?.message||error));return false}
  }

  return{init,get,save,limits:{maxBytes,maxEntries,ttlDays}};
}

export const __test={DEFAULT_MAX_BYTES,DEFAULT_MAX_ENTRIES,DEFAULT_TTL_DAYS};
