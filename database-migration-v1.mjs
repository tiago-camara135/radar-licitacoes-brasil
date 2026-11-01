import { Pool } from 'pg';

const SOURCE_URL=String(process.env.DATABASE_URL||'');
const TARGET_URL=String(process.env.RLB_MIGRATION_TARGET_DATABASE_URL||'');
const RUN=String(process.env.RLB_MIGRATION_RUN||'0')==='1';
const qid=v=>'"'+String(v).replaceAll('"','""')+'"';
const ssl={rejectUnauthorized:false};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function tableNames(client){const r=await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'rlb_migration_meta' ORDER BY tablename`);return r.rows.map(x=>x.tablename)}
async function enumDefs(client){const r=await client.query(`SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder) labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname`);return r.rows}
async function sequenceDefs(client){return (await client.query(`SELECT sequencename,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows}
async function columns(client,table){return (await client.query(`SELECT a.attname,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,pg_get_expr(ad.adbin,ad.adrelid) default_expr,a.attidentity,a.attgenerated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum WHERE n.nspname='public' AND c.relname=$1 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[table])).rows}
async function constraints(client,table){return (await client.query(`SELECT conname,contype,pg_get_constraintdef(oid,true) definition FROM pg_constraint WHERE conrelid=($1::text)::regclass ORDER BY CASE contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 WHEN 'f' THEN 4 ELSE 5 END,conname`,[`public.${table}`])).rows}
async function indexes(client,table){return (await client.query(`SELECT i.indexname,i.indexdef FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename=$1 AND NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conindid=(quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass) ORDER BY i.indexname`,[table])).rows}
async function functions(client){return (await client.query(`SELECT p.oid,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY p.oid`)).rows}
async function triggers(client){return (await client.query(`SELECT c.relname table_name,t.tgname,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows}
async function views(client){return (await client.query(`SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname`)).rows}

async function ensureCleanTarget(target){const names=await tableNames(target);if(names.length)throw new Error(`Destino não está vazio: ${names.join(', ')}`);await target.query(`CREATE TABLE IF NOT EXISTS rlb_migration_meta(id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),status text NOT NULL,started_at timestamptz NOT NULL DEFAULT NOW(),completed_at timestamptz,source_counts jsonb,target_counts jsonb,note text)`);await target.query(`INSERT INTO rlb_migration_meta(id,status,note) VALUES(1,'running','Migração servidor-a-servidor do Radar') ON CONFLICT(id) DO UPDATE SET status='running',started_at=NOW(),completed_at=NULL,note=EXCLUDED.note`)}
async function createEnums(source,target){for(const e of await enumDefs(source)){const labels=e.labels.map(x=>`'${String(x).replaceAll("'","''")}'`).join(',');await target.query(`CREATE TYPE ${qid(e.typname)} AS ENUM (${labels})`)}}
async function createSequences(source,target){for(const s of await sequenceDefs(source)){let sql=`CREATE SEQUENCE ${qid(s.sequencename)} INCREMENT BY ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value} CACHE ${s.cache_size} ${s.cycle?'CYCLE':'NO CYCLE'}`;await target.query(sql)}}
async function createTables(source,target,names){for(const table of names){const cols=await columns(source,table);const defs=cols.map(c=>{let d=`${qid(c.attname)} ${c.type}`;if(c.attidentity)d+=` GENERATED ${c.attidentity==='a'?'ALWAYS':'BY DEFAULT'} AS IDENTITY`;else if(c.default_expr)d+=` DEFAULT ${c.default_expr}`;if(c.attnotnull)d+=' NOT NULL';return d});await target.query(`CREATE TABLE ${qid(table)}(${defs.join(',')})`)}}
function prepared(v){return v}
async function copyTable(source,target,table){const src=await source.query(`SELECT * FROM ${qid(table)}`);if(!src.rows.length)return 0;const cols=src.fields.map(f=>f.name),quoted=cols.map(qid).join(',');const batchSize=Math.max(1,Math.floor(4000/Math.max(cols.length,1)));for(let offset=0;offset<src.rows.length;offset+=batchSize){const rows=src.rows.slice(offset,offset+batchSize),vals=[],groups=[];for(const row of rows){const ph=[];for(const c of cols){vals.push(prepared(row[c]));ph.push('$'+vals.length)}groups.push('('+ph.join(',')+')')}await target.query(`INSERT INTO ${qid(table)}(${quoted}) VALUES ${groups.join(',')}`,vals)}return src.rows.length}
async function addNonForeignConstraints(source,target,names){for(const table of names){for(const c of await constraints(source,table)){if(c.contype==='f')continue;await target.query(`ALTER TABLE ${qid(table)} ADD CONSTRAINT ${qid(c.conname)} ${c.definition}`)}}}
async function addForeignConstraints(source,target,names){for(const table of names){for(const c of await constraints(source,table)){if(c.contype!=='f')continue;await target.query(`ALTER TABLE ${qid(table)} ADD CONSTRAINT ${qid(c.conname)} ${c.definition}`)}}}
async function addIndexes(source,target,names){for(const table of names){for(const i of await indexes(source,table)){await target.query(i.indexdef)}}}
async function addFunctionsAndTriggers(source,target){for(const f of await functions(source))await target.query(f.definition);for(const t of await triggers(source))await target.query(t.definition)}
async function addViews(source,target){for(const v of await views(source))await target.query(`CREATE VIEW ${qid(v.viewname)} AS ${v.definition}`)}
async function syncSequences(source,target){for(const s of await sequenceDefs(source)){if(s.last_value===null)continue;let called=true;try{const r=await source.query(`SELECT is_called FROM ${qid(s.sequencename)}`);called=Boolean(r.rows[0]?.is_called)}catch{}await target.query('SELECT setval($1::regclass,$2,$3)',[`public.${s.sequencename}`,String(s.last_value),called])}}
async function counts(client,names){const out={};for(const t of names){out[t]=Number((await client.query(`SELECT COUNT(*)::bigint n FROM ${qid(t)}`)).rows[0]?.n||0)}return out}
function equalCounts(a,b){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>a[k]===b[k])}

export async function runDatabaseMigrationIfRequested(){
  if(!RUN){console.log('database migration v1: disabled');return null}
  if(!SOURCE_URL||!TARGET_URL)throw new Error('database migration v1: source/target URL ausente');
  if(SOURCE_URL===TARGET_URL)throw new Error('database migration v1: origem e destino são iguais');
  const source=new Pool({connectionString:SOURCE_URL,ssl,max:2,idleTimeoutMillis:30000});const target=new Pool({connectionString:TARGET_URL,ssl,max:2,idleTimeoutMillis:30000});
  console.log('database migration v1: scheduled start in 15s; application should be write-frozen');await sleep(15000);
  try{
    await source.query('SELECT 1');await target.query('SELECT 1');const names=await tableNames(source);console.log(`database migration v1: source tables=${names.length}`);await ensureCleanTarget(target);await createEnums(source,target);await createSequences(source,target);await createTables(source,target,names);
    const copied={};for(const t of names){copied[t]=await copyTable(source,target,t);console.log(`database migration v1: copied ${t}=${copied[t]}`)}
    await addNonForeignConstraints(source,target,names);await addForeignConstraints(source,target,names);await addIndexes(source,target,names);await syncSequences(source,target);await addFunctionsAndTriggers(source,target);await addViews(source,target);
    const sourceCounts=await counts(source,names),targetCounts=await counts(target,names);if(!equalCounts(sourceCounts,targetCounts))throw new Error('Contagens divergentes após migração');await target.query(`UPDATE rlb_migration_meta SET status='complete',completed_at=NOW(),source_counts=$1,target_counts=$2,note='Contagens validadas; banco pronto para cutover' WHERE id=1`,[sourceCounts,targetCounts]);console.log(`database migration v1 COMPLETE: tables=${names.length} rows=${Object.values(targetCounts).reduce((a,b)=>a+b,0)}`);return{ok:true,tables:names.length,sourceCounts,targetCounts}
  }catch(e){console.error('database migration v1 FAILED:',e?.stack||e);try{await target.query(`UPDATE rlb_migration_meta SET status='failed',completed_at=NOW(),note=$1 WHERE id=1`,[String(e?.message||e).slice(0,1000)])}catch{}throw e}finally{await source.end().catch(()=>{});await target.end().catch(()=>{})}
}
