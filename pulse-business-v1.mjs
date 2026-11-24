import {effectivePncpDeadline} from './pncp-operational-date-v1.mjs';
import {fetchPncpContractPage} from './pncp-client-v3.mjs';
const UFS=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const clean=(v,n=180)=>String(v??'').trim().slice(0,n);
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const date=v=>{const s=String(v??'').slice(0,10);const t=Date.parse(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?s:null};
const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const bad=message=>Object.assign(new Error(message),{status:400});
export function filters(params){
 const uf=clean(params.get('uf'),2).toUpperCase();if(uf&&!UFS.has(uf))throw bad('UF inválida.');
 const keyword=clean(params.get('keyword'));const minRaw=params.get('min'),maxRaw=params.get('max');
 const min=minRaw===null||minRaw===''?null:number(minRaw),max=maxRaw===null||maxRaw===''?null:number(maxRaw);
 if((minRaw&&min===null)||(maxRaw&&max===null)||(min!==null&&max!==null&&min>max))throw bad('Faixa de valores inválida.');
 return {uf,keyword,min,max};
}
export async function nationalIntelligence(pool,params){
 const {uf,keyword,min,max}=filters(params);
 const deadline=effectivePncpDeadline('m');
 const sql='WITH active AS (SELECT m.pncp_id,m.uf,m.modality_name,m.org_name,m.estimated_value,m.detected_at,'+deadline+' AS closes_at FROM monitored_procurements m WHERE m.closes_at>=NOW()-INTERVAL \'3 hours\' AND ($1=\'\' OR UPPER(m.uf)=$1) AND ($2=\'\' OR POSITION(LOWER($2) IN LOWER(COALESCE(m.object_text,\'\')||\' \'||COALESCE(m.org_name,\'\')))>0) AND ($3::numeric IS NULL OR m.estimated_value >= $3) AND ($4::numeric IS NULL OR m.estimated_value <= $4)), scoped AS (SELECT * FROM active WHERE closes_at>=NOW()), groups AS (SELECT \'uf\' AS kind,COALESCE(NULLIF(uf,\'\'),\'Não informada\') label,COUNT(*)::int count FROM scoped GROUP BY 1,2 UNION ALL SELECT \'modality\',COALESCE(NULLIF(modality_name,\'\'),\'Não informada\'),COUNT(*)::int FROM scoped GROUP BY 1,2 UNION ALL SELECT \'org\',COALESCE(NULLIF(org_name,\'\'),\'Não informado\'),COUNT(*)::int FROM scoped GROUP BY 1,2) SELECT (SELECT json_build_object(\'active\',COUNT(*),\'new_today\',COUNT(*) FILTER(WHERE detected_at>=date_trunc(\'day\',NOW() AT TIME ZONE \'America/Fortaleza\') AT TIME ZONE \'America/Fortaleza\'),\'due7\',COUNT(*) FILTER(WHERE closes_at<=NOW()+INTERVAL \'7 days\'),\'estimated_total\',SUM(estimated_value) FILTER(WHERE estimated_value IS NOT NULL AND estimated_value>0),\'known_values\',COUNT(*) FILTER(WHERE estimated_value>0),\'last_detected\',MAX(detected_at)) FROM scoped) metrics,(SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),\'[]\'::json) FROM groups g WHERE kind=\'uf\') ufs,(SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),\'[]\'::json) FROM groups g WHERE kind=\'modality\') modalities,(SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),\'[]\'::json) FROM (SELECT * FROM groups WHERE kind=\'org\' ORDER BY count DESC,label LIMIT 10) g) organizations';
 const {rows}=await pool.query({text:sql,values:[uf,keyword,min,max],query_timeout:8000});
 return {...rows[0],scope:{uf,keyword,min,max},generated_at:new Date().toISOString(),source:'Base monitorada PNCP; cobertura parcial possível. Valores estimados, não contratados.'};
}
export function contractParams(params){
 const start=date(params.get('start')),end=date(params.get('end')),page=Number(params.get('page')||1);
 if(!start||!end||start>end||Date.parse(end)-Date.parse(start)>30*86400000||end>localDay())throw bad('Informe até 31 dias de publicação, sem datas futuras.');
 if(!Number.isInteger(page)||page<1||page>10000)throw bad('Página inválida.');
 const supplier=clean(params.get('supplier'),18).replace(/\D/g,'');if(supplier&&supplier.length!==14)throw bad('Informe um CNPJ empresarial com 14 dígitos.');
 const expiry=Number(params.get('expiry')||0);if(![0,30,60,90].includes(expiry))throw bad('Prazo inválido.');
 return {start,end,page,supplier,expiry,...filters(params)};
}
export function contractView(body,f,reference=localDay()){
 const raw=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
 const items=[];const seen=new Set();
 const cutoff=new Date(Date.parse(reference)+f.expiry*86400000).toISOString().slice(0,10);
 for(const x of raw){
  const id=clean(x.numeroControlePNCP,100);if(!id||seen.has(id))continue;seen.add(id);
  const uf=clean(x.unidadeOrgao?.ufSigla,2).toUpperCase(),object=clean(x.objetoContrato,1500),org=clean(x.orgaoEntidade?.razaoSocial,250),supplierId=String(x.niFornecedor??'').replace(/\D/g,'');
  const corporate=x.tipoPessoa==='PJ'&&supplierId.length===14;
  const supplierName=corporate?clean(x.nomeRazaoSocialFornecedor,250):'Fornecedor não empresarial';
  const value=number(x.valorGlobal),end=date(x.dataVigenciaFim),published=date(x.dataPublicacaoPncp);
  if(f.uf&&uf!==f.uf||f.supplier&&(!corporate||supplierId!==f.supplier)||f.keyword&&!norm([object,org,supplierName].join(' ')).includes(norm(f.keyword))||f.expiry&&(!end||end<reference||end>cutoff)||f.min!==null&&(value===null||value<f.min)||f.max!==null&&(value===null||value>f.max))continue;
  const cnpj=String(x.orgaoEntidade?.cnpj??''),year=Number(x.anoContrato),seq=Number(x.sequencialContrato);
  const url=/^\d{14}$/.test(cnpj)&&Number.isInteger(year)&&year>=2000&&Number.isInteger(seq)&&seq>0?'https://pncp.gov.br/app/contratos/'+cnpj+'/'+year+'/'+seq:null;
  items.push({id,object,org,uf,municipality:clean(x.unidadeOrgao?.municipioNome,120),supplier:corporate?supplierId:null,supplier_name:supplierName,value,published,end,url,type:clean(x.tipoContrato?.nome,120)});
 }
 const suppliers=new Map(),months=new Map();
 for(const x of items){if(x.supplier){const e=suppliers.get(x.supplier)||{name:x.supplier_name,cnpj:x.supplier,count:0,value:0,known:0};e.count++;if(x.value!==null){e.value+=x.value;e.known++}suppliers.set(x.supplier,e)}if(x.published){const k=x.published.slice(0,7),e=months.get(k)||{month:k,count:0,value:0,known:0};e.count++;if(x.value!==null){e.value+=x.value;e.known++}months.set(k,e)}}
 const known=items.filter(x=>x.value!==null);
 return {items,summary:{count:items.length,known_values:known.length,value:known.length?known.reduce((a,x)=>a+x.value,0):null,due90:items.filter(x=>x.end&&x.end>=reference&&x.end<=new Date(Date.parse(reference)+90*86400000).toISOString().slice(0,10)).length},suppliers:[...suppliers.values()].sort((a,b)=>b.count-a.count).slice(0,10),months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),coverage:{page:f.page,page_size:50,received:raw.length,total_pages:Number(body?.totalPaginas)||0,total_records:Number(body?.totalRegistros)||0,local_filters:true,complete:false},generated_at:new Date().toISOString(),source:'PNCP /v1/contratos — publicação por período; filtros aplicados somente à página consultada. Vencimento não garante nova contratação.'};
}
export async function contracts(params){const f=contractParams(params);return contractView(await fetchPncpContractPage(f),f)}
