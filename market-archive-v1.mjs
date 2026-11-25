// Public contract archive: only normalized corporate identifiers; no user search history.
const clean=(v,n=180)=>String(v??'').trim().slice(0,n);
const bad=message=>Object.assign(new Error(message),{status:400});
const validCnpj=v=>/^\d{14}$/.test(String(v||''));
const fold=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const schemas=new WeakMap();
export const ARCHIVE_CAP=25000;
export function initMarketArchive(pool){
 if(schemas.has(pool))return schemas.get(pool);
 const task=(async()=>{
  await pool.query('CREATE TABLE IF NOT EXISTS market_contract_archive (id TEXT PRIMARY KEY, object TEXT NOT NULL, org TEXT NOT NULL, org_cnpj TEXT, uf TEXT, municipality TEXT, supplier TEXT, supplier_name TEXT NOT NULL, value NUMERIC, published DATE, expires DATE, url TEXT, type TEXT, source_updated TIMESTAMPTZ, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_market_archive_supplier ON market_contract_archive(supplier,published DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_market_archive_org ON market_contract_archive(org_cnpj,published DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_market_archive_dates ON market_contract_archive(published,expires)');
  await pool.query('CREATE TABLE IF NOT EXISTS market_contract_pages (start_date DATE NOT NULL,end_date DATE NOT NULL,page INTEGER NOT NULL,received INTEGER NOT NULL,total_pages INTEGER NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(start_date,end_date,page))');
  await pool.query('CREATE TABLE IF NOT EXISTS market_watchlist (user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind TEXT NOT NULL CHECK(kind IN (\'supplier\',\'org\')),cnpj TEXT NOT NULL, label TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(user_id,kind,cnpj))');
 })().catch(e=>{schemas.delete(pool);throw e});
 schemas.set(pool,task);return task;
}
export async function saveContractPage(pool,items,coverage){
 await initMarketArchive(pool);
 const rows=items.map(x=>({...x,expires:x.end,source_updated:x.source_updated||null}));
 const c=await pool.connect();
 try{
  await c.query('BEGIN');
  await c.query("SET LOCAL statement_timeout='8s'");
  await c.query('SELECT pg_advisory_xact_lock(74120261)');
  const count=Number((await c.query('SELECT COUNT(*)::int AS n FROM market_contract_archive')).rows[0].n);
  const ids=rows.map(x=>x.id),existing=new Set((await c.query('SELECT id FROM market_contract_archive WHERE id=ANY($1::text[])',[ids])).rows.map(x=>x.id));
  let room=Math.max(0,ARCHIVE_CAP-count),omitted=0;
  const accepted=rows.filter(x=>existing.has(x.id)||room-->0?true:(omitted++,false));
  if(accepted.length)await c.query("INSERT INTO market_contract_archive(id,object,org,org_cnpj,uf,municipality,supplier,supplier_name,value,published,expires,url,type,source_updated) SELECT id,object,org,org_cnpj,uf,municipality,supplier,supplier_name,value,published,expires,url,type,source_updated FROM jsonb_to_recordset($1::jsonb) AS r(id text,object text,org text,org_cnpj text,uf text,municipality text,supplier text,supplier_name text,value numeric,published date,expires date,url text,type text,source_updated timestamptz) ON CONFLICT(id) DO UPDATE SET object=EXCLUDED.object,org=EXCLUDED.org,org_cnpj=EXCLUDED.org_cnpj,uf=EXCLUDED.uf,municipality=EXCLUDED.municipality,supplier=EXCLUDED.supplier,supplier_name=EXCLUDED.supplier_name,value=EXCLUDED.value,published=EXCLUDED.published,expires=EXCLUDED.expires,url=EXCLUDED.url,type=EXCLUDED.type,source_updated=EXCLUDED.source_updated,observed_at=NOW() WHERE market_contract_archive.source_updated IS NULL OR EXCLUDED.source_updated>=market_contract_archive.source_updated",[JSON.stringify(accepted)]);
  // Never mark a page as archived if some records were omitted by the storage limit.
  if(!omitted&&accepted.length===coverage.received)await c.query('INSERT INTO market_contract_pages(start_date,end_date,page,received,total_pages) VALUES($1,$2,$3,$4,$5) ON CONFLICT(start_date,end_date,page) DO UPDATE SET received=EXCLUDED.received,total_pages=EXCLUDED.total_pages,observed_at=NOW()',[coverage.start,coverage.end,coverage.page,coverage.received,coverage.total_pages]);
  await c.query('COMMIT');return {archived:accepted.length,omitted,cap:ARCHIVE_CAP};
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
}
export function archiveScope(p){
 const keyword=clean(p.get('keyword')),supplier=clean(p.get('supplier'),18).replace(/\D/g,''),org=clean(p.get('org'),18).replace(/\D/g,''),uf=clean(p.get('uf'),2).toUpperCase(),expiry=Number(p.get('expiry')||0),page=Number(p.get('page')||1);
 if(supplier&&!validCnpj(supplier)||org&&!validCnpj(org)||uf&&!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf)||![0,30,60,90].includes(expiry)||!Number.isInteger(page)||page<1||page>1000)throw bad('Filtros do acervo inválidos.');
 const sort=clean(p.get('sort'),20)||'recent';
 if(!['recent','expiry','value'].includes(sort))throw bad('Ordenação inválida.');
 return {keyword,supplier,org,uf,expiry,page,sort};
}
export async function archiveReport(pool,p){
 await initMarketArchive(pool);const f=archiveScope(p),sort={recent:'published DESC NULLS LAST,id',expiry:'expires ASC NULLS LAST,id',value:'value DESC NULLS LAST,id'}[f.sort];
 const sql="WITH scoped AS (SELECT * FROM market_contract_archive WHERE ($1='' OR POSITION($1 IN translate(lower(object||' '||org||' '||supplier_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))>0) AND ($2='' OR supplier=$2) AND ($3='' OR org_cnpj=$3) AND ($4='' OR uf=$4) AND ($5::int=0 OR expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+$5::int)), ranked AS (SELECT * FROM scoped ORDER BY "+sort+" LIMIT 30 OFFSET $6), companies AS (SELECT supplier cnpj,MAX(supplier_name) label,COUNT(*)::int count,SUM(value) value,COUNT(DISTINCT org_cnpj)::int organizations FROM scoped WHERE supplier IS NOT NULL GROUP BY supplier ORDER BY count DESC,cnpj LIMIT 15), buyers AS (SELECT org_cnpj cnpj,MAX(org) label,COUNT(*)::int count,SUM(value) value,COUNT(DISTINCT supplier)::int suppliers FROM scoped WHERE org_cnpj IS NOT NULL GROUP BY org_cnpj ORDER BY count DESC,cnpj LIMIT 15), months AS (SELECT to_char(published,'YYYY-MM') label,COUNT(*)::int count,SUM(value) value FROM scoped WHERE published IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 24) SELECT (SELECT json_build_object('count',COUNT(*),'value',SUM(value),'known_values',COUNT(value),'suppliers',COUNT(DISTINCT supplier),'buyers',COUNT(DISTINCT org_cnpj),'due30',COUNT(*) FILTER(WHERE expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+30),'due60',COUNT(*) FILTER(WHERE expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+60),'due90',COUNT(*) FILTER(WHERE expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+90)) FROM scoped) summary,(SELECT COALESCE(json_agg(r ORDER BY "+sort+"),'[]'::json) FROM ranked r) items,(SELECT COALESCE(json_agg(c ORDER BY c.count DESC,c.cnpj),'[]'::json) FROM companies c) suppliers,(SELECT COALESCE(json_agg(b ORDER BY b.count DESC,b.cnpj),'[]'::json) FROM buyers b) buyers,(SELECT COALESCE(json_agg(m ORDER BY m.label),'[]'::json) FROM months m) months,(SELECT json_build_object('records',COUNT(*),'first_publication',MIN(published),'last_publication',MAX(published),'last_observed',MAX(observed_at),'pages',(SELECT COUNT(*) FROM market_contract_pages)) FROM market_contract_archive) coverage";
 const {rows}=await pool.query({text:sql,values:[fold(f.keyword),f.supplier,f.org,f.uf,f.expiry,(f.page-1)*30],query_timeout:8000});
 return {...rows[0],scope:f,cap:ARCHIVE_CAP,source:'Acervo parcial de páginas oficiais PNCP efetivamente consultadas. Não representa todos os contratos nem confirma vigência atual ou futura licitação.',generated_at:new Date().toISOString()};
}
export async function watchlist(pool,uid,body){
 await initMarketArchive(pool);
 if(body!==undefined){const kind=clean(body.kind,10),cnpj=clean(body.cnpj,14);if(!['supplier','org'].includes(kind)||!validCnpj(cnpj)||typeof body.remove!=='boolean')throw bad('Favorito inválido.');
 if(body.remove)await pool.query('DELETE FROM market_watchlist WHERE user_id=$1 AND kind=$2 AND cnpj=$3',[uid,kind,cnpj]);
 else{const col=kind==='supplier'?'supplier':'org_cnpj',name=kind==='supplier'?'supplier_name':'org';await pool.query('INSERT INTO market_watchlist(user_id,kind,cnpj,label) SELECT $1,$2,$3,MAX('+name+') FROM market_contract_archive WHERE '+col+'=$3 HAVING COUNT(*)>0 AND (SELECT COUNT(*) FROM market_watchlist WHERE user_id=$1)<100 ON CONFLICT DO NOTHING',[uid,kind,cnpj])}}
 return (await pool.query('SELECT kind,cnpj,label FROM market_watchlist WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[uid])).rows;
}
