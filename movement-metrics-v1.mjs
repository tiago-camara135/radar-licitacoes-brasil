import { Pool } from 'pg';

const DATABASE_URL=process.env.DATABASE_URL||'';
const pool=DATABASE_URL?new Pool({connectionString:DATABASE_URL,ssl:{rejectUnauthorized:false},max:2,idleTimeoutMillis:30_000}):null;

function common(res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
}

export async function handleMovementMetrics(req,res,url){
  if(req.method!=='GET'||url.pathname!=='/api/movement-metrics')return false;
  common(res);
  if(!pool){res.statusCode=503;res.end(JSON.stringify({error:'Base de monitoramento indisponível.'}));return true}
  try{
    const summarySql=`
      WITH b AS (
        SELECT COALESCE(published_at,detected_at) AS ts, closes_at
        FROM monitored_procurements
      )
      SELECT
        COUNT(*)::int AS total_stored,
        COUNT(*) FILTER (WHERE ts >= NOW()-INTERVAL '24 hours')::int AS last_24h,
        COUNT(*) FILTER (WHERE ts >= NOW()-INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE ts >= NOW()-INTERVAL '30 days')::int AS last_30d,
        ROUND((COUNT(*) FILTER (WHERE ts >= NOW()-INTERVAL '30 days'))::numeric/30,1) AS avg_daily_30d,
        COUNT(*) FILTER (WHERE closes_at IS NOT NULL AND closes_at >= NOW())::int AS open_now
      FROM b`;
    const statesSql=`
      SELECT uf,COUNT(*)::int AS total
      FROM monitored_procurements
      WHERE COALESCE(published_at,detected_at)>=NOW()-INTERVAL '30 days'
        AND uf IS NOT NULL AND BTRIM(uf)<>''
      GROUP BY uf ORDER BY total DESC,uf ASC LIMIT 5`;
    const modalitiesSql=`
      SELECT COALESCE(NULLIF(BTRIM(modality_name),''),'Modalidade '||COALESCE(modality_code::text,'N/I')) AS name,
             COUNT(*)::int AS total
      FROM monitored_procurements
      WHERE COALESCE(published_at,detected_at)>=NOW()-INTERVAL '30 days'
      GROUP BY 1 ORDER BY total DESC,name ASC LIMIT 5`;
    const dailySql=`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE-6,CURRENT_DATE,INTERVAL '1 day')::date AS day
      ), counts AS (
        SELECT COALESCE(published_at,detected_at)::date AS day,COUNT(*)::int AS total
        FROM monitored_procurements
        WHERE COALESCE(published_at,detected_at)>=CURRENT_DATE-6
        GROUP BY 1
      )
      SELECT TO_CHAR(days.day,'DD/MM') AS day,COALESCE(counts.total,0)::int AS total
      FROM days LEFT JOIN counts USING(day) ORDER BY days.day`;
    const [summary,states,modalities,daily]=await Promise.all([
      pool.query(summarySql),pool.query(statesSql),pool.query(modalitiesSql),pool.query(dailySql)
    ]);
    res.statusCode=200;
    res.end(JSON.stringify({
      source:'Radar de Licitações Brasil / registros monitorados do PNCP',
      scope:'Base real armazenada pelo monitor do Radar. Não representa, isoladamente, o universo integral do PNCP quando houver limitação da API oficial.',
      period_days:30,
      summary:summary.rows[0]||{},
      top_states:states.rows,
      top_modalities:modalities.rows,
      daily_7d:daily.rows,
      generated_at:new Date().toISOString()
    }));
  }catch(e){
    console.error('movement metrics error:',e?.message||e);
    res.statusCode=500;
    res.end(JSON.stringify({error:'Não foi possível calcular os indicadores de movimentação.'}));
  }
  return true;
}
