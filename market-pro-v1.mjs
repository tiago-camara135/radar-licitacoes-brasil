import {initMarketArchive} from './market-archive-v1.mjs';
import {createPncpTransport} from './pncp-transport-v1.mjs';
const transport=createPncpTransport({spacing:650,maxRetries:1,maxConcurrent:1,acceptBody:b=>b&&typeof b==='object'});
const bad=message=>Object.assign(new Error(message),{status:400});
const str=(v,n=250)=>String(v??'').trim().slice(0,n);
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const id=(v,label)=>{const s=String(v??'').replace(/[.\/-]/g,'');if(!/^\d{14}$/.test(s))throw bad(label+' inválido');return s};
const integer=(v,label,min=1,max=999999999)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw bad(label+' inválido');return n};
const array=v=>Array.isArray(v)?v:Array.isArray(v?.data)?v.data:[];
const official=async path=>(await transport.get('https://pncp.gov.br/api/pncp'+path)).body;
export function priceSummary(rows){
 const prices=rows.map(x=>num(x.valorUnitarioHomologado)).filter(x=>x!==null).sort((a,b)=>a-b);
 if(!prices.length)return {count:0,min:null,median:null,max:null};
 const i=Math.floor(prices.length/2);return {count:prices.length,min:prices[0],median:prices.length%2?prices[i]:(prices[i-1]+prices[i])/2,max:prices.at(-1)};
}
export async function lookupMarket(p,fetchOfficial=official){
 const kind=p.get('kind'),cnpj=id(p.get('cnpj'),'CNPJ do órgão'),year=integer(p.get('year'),'Ano',2000,2100);
 const base='/v1/orgaos/'+cnpj;
 if(kind==='pca'){
  const raw=await fetchOfficial(base+'/pca/'+year+'/consolidado');
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.anoPca)return {kind,found:false};
  return {kind,found:true,org:str(raw.razaoSocial),year,quantity:num(raw.quantidade),value:num(raw.valorTotal),published:str(raw.dataPublicacaoPncp,10),updated:str(raw.dataAtualizacao,10),source:'https://pncp.gov.br/app/pca'};
 }
 if(kind!=='pricing')throw bad('Consulta inválida');
 const seq=integer(p.get('sequence'),'Sequencial'),item=integer(p.get('item'),'Item');
 const path=base+'/compras/'+year+'/'+seq+'/itens/'+item+'/resultados';
 const raw=array(await fetchOfficial(path));
 // Only explicitly active results; unknown statuses are excluded rather than presumed valid.
 const active=raw.filter(x=>Number(x.situacaoCompraItemResultadoId)===1);
 const rows=active.map(x=>({price:num(x.valorUnitarioHomologado),quantity:num(x.quantidadeHomologada),discount:num(x.percentualDesconto)}));
 return {kind,summary:priceSummary(active),rows:rows.slice(0,100),excluded:raw.length-active.length,source:'https://pncp.gov.br/app/editais/'+cnpj+'/'+year+'/'+seq,warning:'Amostra de resultados informados de um único item. Confira unidade, descrição, critério de julgamento e situação no PNCP. Não é pesquisa de preços de mercado.'};
}
export async function marketSignals(pool,uid,p){
 await initMarketArchive(pool);
 const keyword=str(p.get('keyword'),180).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const companies=[...new Set(String(p.get('companies')||'').split(',').map(s=>s.trim()).filter(Boolean).map(s=>id(s,'CNPJ do fornecedor')))];
 if(companies.length>3)throw bad('Compare até três empresas');
 const q=await pool.query({text:"WITH scope AS (SELECT * FROM market_contract_archive WHERE ($1='' OR POSITION($1 IN translate(lower(object||' '||org||' '||supplier_name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'))>0)), states AS (SELECT uf,COUNT(*)::int count,SUM(value) value FROM scope WHERE uf ~ '^[A-Z]{2}$' GROUP BY uf), competitors AS (SELECT supplier cnpj,MAX(supplier_name) label,COUNT(*)::int count,SUM(value) value,COUNT(DISTINCT org_cnpj)::int buyers,COUNT(value)::int known FROM scope WHERE supplier=ANY($2::text[]) GROUP BY supplier), recent AS (SELECT DISTINCT a.id,a.object,a.org,a.supplier_name,a.published,a.expires,a.url FROM market_contract_archive a JOIN market_watchlist w ON w.user_id=$3 AND ((w.kind='supplier' AND w.cnpj=a.supplier) OR (w.kind='org' AND w.cnpj=a.org_cnpj)) WHERE a.published BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date-7 AND (NOW() AT TIME ZONE 'America/Fortaleza')::date OR w.user_id=$3 AND a.expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+30 ORDER BY a.published DESC NULLS LAST,a.id LIMIT 30) SELECT (SELECT COALESCE(json_agg(s ORDER BY s.count DESC,s.uf),'[]') FROM states s) states,(SELECT COALESCE(json_agg(c ORDER BY c.count DESC,c.cnpj),'[]') FROM competitors c) competitors,(SELECT COALESCE(json_agg(r),'[]') FROM recent r) alerts,(SELECT COUNT(*)::int FROM scope) total,(SELECT COUNT(*)::int FROM scope WHERE expires BETWEEN (NOW() AT TIME ZONE 'America/Fortaleza')::date AND (NOW() AT TIME ZONE 'America/Fortaleza')::date+30) due30",values:[keyword,companies,uid],query_timeout:8000});
 const d=q.rows[0];return {...d,companies,source:'Acervo parcial PNCP. Alertas em tela: publicações nos últimos 7 dias ou vencimentos nos próximos 30 dias dos favoritos. Não equivale a notificação enviada.'};
}
