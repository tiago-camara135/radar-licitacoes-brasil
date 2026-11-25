import {effectivePncpDeadline} from './pncp-operational-date-v1.mjs';
import {fetchPncpContractPage,fetchPncpAtaPage} from './pncp-client-v3.mjs';
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
const REGIONS={Norte:['AC','AP','AM','PA','RO','RR','TO'],Nordeste:['AL','BA','CE','MA','PB','PE','PI','RN','SE'],'Centro-Oeste':['DF','GO','MT','MS'],Sudeste:['ES','MG','RJ','SP'],Sul:['PR','RS','SC']};
const cache=new Map(),pending=new Map();
export function nationalScope(params){
 const f=filters(params),region=clean(params.get('region'),30),modality=clean(params.get('modality'),150),org=clean(params.get('org'),250),kind=clean(params.get('kind'),20)||'all';
 if(region&&!Object.hasOwn(REGIONS,region)||!['all','today','due7','valued'].includes(kind))throw bad('Filtro inválido.');
 return {...f,region,modality,org,kind};
}
async function computeNational(pool,f){
 const {uf,keyword,min,max,region,modality,org,kind}=f,deadline=effectivePncpDeadline('m');
 // The translation keeps the search accent-insensitive without a database extension.
 const fold=x=>"translate(lower("+x+"),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')";
 const sql=`WITH active AS (
 SELECT m.pncp_id,m.org_cnpj,m.year,m.sequence,m.object_text,m.uf,m.municipality,m.modality_name,m.org_name,m.estimated_value,m.detected_at,m.pncp_url,${deadline} AS closes_at
 FROM monitored_procurements m WHERE m.closes_at>=NOW()-INTERVAL '3 hours' AND ($1='' OR UPPER(m.uf)=$1)
 AND ($2='' OR POSITION($2 IN ${fold("COALESCE(m.object_text,'')||' '||COALESCE(m.org_name,'')")})>0)
 AND ($3::numeric IS NULL OR m.estimated_value >= $3) AND ($4::numeric IS NULL OR m.estimated_value <= $4)
 AND ($5::text[] IS NULL OR UPPER(m.uf)=ANY($5)) AND ($6='' OR m.modality_name=$6) AND ($7='' OR m.org_name=$7)
 ), scoped AS (SELECT * FROM active WHERE closes_at>=NOW()),
 selected AS (SELECT * FROM scoped WHERE $8='all' OR ($8='today' AND detected_at>=date_trunc('day',NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza') OR ($8='due7' AND closes_at<=NOW()+INTERVAL '7 days') OR ($8='valued' AND estimated_value>0)),
 groups AS (SELECT 'uf' kind,COALESCE(NULLIF(uf,''),'Não informada') label,COUNT(*)::int count FROM scoped GROUP BY 1,2 UNION ALL SELECT 'modality',COALESCE(NULLIF(modality_name,''),'Não informada'),COUNT(*)::int FROM scoped GROUP BY 1,2 UNION ALL SELECT 'org',COALESCE(NULLIF(org_name,''),'Não informado'),COUNT(*)::int FROM scoped GROUP BY 1,2)
 SELECT (SELECT json_build_object('active',COUNT(*),'new_today',COUNT(*) FILTER(WHERE detected_at>=date_trunc('day',NOW() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza'),'due7',COUNT(*) FILTER(WHERE closes_at<=NOW()+INTERVAL '7 days'),'estimated_total',SUM(estimated_value) FILTER(WHERE estimated_value>0),'known_values',COUNT(*) FILTER(WHERE estimated_value>0),'last_detected',MAX(detected_at)) FROM scoped) metrics,
 (SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),'[]'::json) FROM groups g WHERE kind='uf') ufs,
 (SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),'[]'::json) FROM groups g WHERE kind='modality') modalities,
 (SELECT COALESCE(json_agg(g ORDER BY g.count DESC,g.label),'[]'::json) FROM (SELECT * FROM groups WHERE kind='org' ORDER BY count DESC,label LIMIT 10) g) organizations,
 (SELECT count(*) FROM selected) result_count,
 (SELECT COALESCE(json_agg(r ORDER BY r.closes_at,r.pncp_id),'[]'::json) FROM (SELECT * FROM selected ORDER BY closes_at,pncp_id LIMIT 30) r) items`;
 const {rows}=await pool.query({text:sql,values:[uf,norm(keyword),min,max,region?REGIONS[region]:null,modality,org,kind],query_timeout:8000});
 const data=rows[0],regions=Object.entries(REGIONS).map(([label,ufs])=>({label,count:(data.ufs||[]).filter(x=>ufs.includes(x.label)).reduce((n,x)=>n+Number(x.count),0)}));
 return {...data,regions,scope:f,generated_at:new Date().toISOString(),source:'Base monitorada PNCP; cobertura parcial possível. Valores estimados, não contratados.'};
}
export async function nationalIntelligence(pool,params){
 const f=nationalScope(params),key=JSON.stringify(f),hit=cache.get(key);
 if(hit&&Date.now()-hit.at<45000)return hit.data;
 if(pending.has(key))return pending.get(key);
 const task=computeNational(pool,f).then(data=>{cache.set(key,{data,at:Date.now()});while(cache.size>64)cache.delete(cache.keys().next().value);return data}).finally(()=>pending.delete(key));
 pending.set(key,task);return task;
}
export function contractParams(params){
 const start=date(params.get('start')),end=date(params.get('end')),page=Number(params.get('page')||1),kind=params.get('kind')||'contract',validity=params.get('validity')||'all',org=clean(params.get('org'),18).replace(/\D/g,'');
 if(!['contract','ata'].includes(kind)||!['all','active','expired','future','unknown','cancelled'].includes(validity)||org&&org.length!==14)throw bad('Tipo, vigência ou CNPJ do órgão inválido.');
 if(!start||!end||start>end||Date.parse(end)-Date.parse(start)>30*86400000||(kind==='contract'&&end>localDay()))throw bad('Cada lote deve abranger até 31 dias; publicação de contratos não admite datas futuras.');
 if(!Number.isInteger(page)||page<1||page>10000)throw bad('Página inválida.');
 const supplier=clean(params.get('supplier'),18).replace(/\D/g,'');if(supplier&&supplier.length!==14)throw bad('Informe um CNPJ empresarial com 14 dígitos.');
 const expiry=Number(params.get('expiry')||0);if(![0,30,60,90].includes(expiry))throw bad('Prazo inválido.');
 const batch=Number(params.get('batch')||1);if(![1,2,3].includes(batch))throw bad('Quantidade de páginas inválida.');
 if(kind==='ata'&&supplier)throw bad('A consulta de atas não disponibiliza fornecedor nesta fonte.');
 return {start,end,page,supplier,expiry,batch,kind,validity,org,...filters(params)};
}
function instrumentMatch(keyword,text){const haystack=norm(text);return norm(keyword).trim().split(/\s+/).filter(Boolean).every(t=>haystack.includes(/^(?:alimentos?|alimenticios?|alimentacao)$/.test(t)?'aliment':t))}
export function instrumentValidity(begin,end,reference,cancelled=false){
 if(cancelled===true)return 'cancelled';
 if(!begin||!end||begin>end)return 'unknown';
 if(end<reference)return 'expired';
 if(begin>reference)return 'future';
 return 'active';
}
function ataRecord(x){
 const id=clean(x.numeroControlePNCP||x.numeroControlePncpAta||x.numeroControle,100);
 const m=id.match(/^(\d{14})-1-(\d+)\/(\d{4})-(\d+)$/);
 const purchase=String(x.numeroControlePNCPCompra||x.numeroControlePncpCompra||'').match(/^(\d{14})-1-(\d+)\/(\d{4})$/)||m;
 const org=clean(x.orgaoEntidade?.razaoSocial||x.orgaoEntidadeRazaoSocial||x.nomeOrgao,250);
 const cnpj=String(x.orgaoEntidade?.cnpj||x.orgaoEntidadeCnpj||x.cnpjOrgao||m?.[1]||'');
 const seq=Number(x.sequencialAta||m?.[4]),year=Number(x.anoCompra||purchase?.[3]),buy=Number(x.sequencialCompra||purchase?.[2]);
 return {id,object:clean(x.objetoContratacao||x.objetoCompra||x.objetoAta,1500),org,org_cnpj:/^\d{14}$/.test(cnpj)?cnpj:null,uf:clean(x.unidadeOrgao?.ufSigla||x.unidadeOrgaoUfSigla||x.ufSigla||x.uf,2).toUpperCase(),municipality:clean(x.unidadeOrgao?.municipioNome||x.unidadeOrgaoMunicipioNome||x.municipioNome,120),supplier:null,supplier_name:'Fornecedor não informado nesta consulta',value:null,published:date(x.dataPublicacaoPncp),begin:date(x.dataVigenciaInicio||x.dataInicioVigencia),end:date(x.dataVigenciaFim||x.dataFimVigencia),cancelled:x.cancelado===true,adhesion:x.possibilidadeAdesao===true?true:x.possibilidadeAdesao===false?false:null,kind:'ata',type:'Ata de registro de preços',number:clean(x.numeroAtaRegistroPreco,80),url:/^\d{14}$/.test(cnpj)&&Number.isInteger(year)&&year>=2000&&Number.isInteger(buy)&&buy>0&&Number.isInteger(seq)&&seq>0?'https://pncp.gov.br/app/atas/'+cnpj+'/'+year+'/'+buy+'/'+seq:null};
}
export function contractView(body,f,reference=localDay()){
 const raw=Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[];
 const items=[];const seen=new Set();
 const cutoff=new Date(Date.parse(reference)+f.expiry*86400000).toISOString().slice(0,10);
 for(const x of raw){
  if(f.kind==='ata'){const a=ataRecord(x);if(!a.id||seen.has(a.id))continue;seen.add(a.id);a.validity=instrumentValidity(a.begin,a.end,reference,a.cancelled);if(f.uf&&a.uf!==f.uf||f.org&&a.org_cnpj!==f.org||f.keyword&&!instrumentMatch(f.keyword,[a.object,a.org,a.number].join(' '))||f.validity&&f.validity!=='all'&&a.validity!==f.validity||f.expiry&&(!a.end||a.validity!=='active'||a.end>cutoff)||f.min!=null||f.max!=null)continue;items.push(a);continue}
  const id=clean(x.numeroControlePNCP,100);if(!id||seen.has(id))continue;seen.add(id);
  const uf=clean(x.unidadeOrgao?.ufSigla,2).toUpperCase(),object=clean(x.objetoContrato,1500),org=clean(x.orgaoEntidade?.razaoSocial,250),supplierId=String(x.niFornecedor??'').replace(/\D/g,'');
  const corporate=x.tipoPessoa==='PJ'&&supplierId.length===14;
  const supplierName=corporate?clean(x.nomeRazaoSocialFornecedor,250):'Fornecedor não empresarial';
  const value=number(x.valorGlobal),end=date(x.dataVigenciaFim),begin=date(x.dataVigenciaInicio),published=date(x.dataPublicacaoPncp),validity=instrumentValidity(begin,end,reference,x.cancelado===true);
  if(f.org&&String(x.orgaoEntidade?.cnpj||'')!==f.org||f.validity&&f.validity!=='all'&&validity!==f.validity||f.uf&&uf!==f.uf||f.supplier&&(!corporate||supplierId!==f.supplier)||f.keyword&&!instrumentMatch(f.keyword,[object,org,supplierName].join(' '))||f.expiry&&(!end||end<reference||end>cutoff)||f.min!==null&&(value===null||value<f.min)||f.max!==null&&(value===null||value>f.max))continue;
  const cnpj=String(x.orgaoEntidade?.cnpj??''),year=Number(x.anoContrato),seq=Number(x.sequencialContrato);
  const url=/^\d{14}$/.test(cnpj)&&Number.isInteger(year)&&year>=2000&&Number.isInteger(seq)&&seq>0?'https://pncp.gov.br/app/contratos/'+cnpj+'/'+year+'/'+seq:null;
  items.push({id,object,org,org_cnpj:/^\d{14}$/.test(cnpj)?cnpj:null,source_updated:Number.isFinite(Date.parse(x.dataAtualizacaoGlobal||x.dataAtualizacao||''))?new Date(x.dataAtualizacaoGlobal||x.dataAtualizacao).toISOString():null,uf,municipality:clean(x.unidadeOrgao?.municipioNome,120),supplier:corporate?supplierId:null,supplier_name:supplierName,value,published,begin,end,validity,kind:'contract',number:clean(x.numeroContratoEmpenho,80),url,type:clean(x.tipoContrato?.nome,120)});
 }
 const suppliers=new Map(),months=new Map();
 for(const x of items){if(x.supplier){const e=suppliers.get(x.supplier)||{name:x.supplier_name,cnpj:x.supplier,count:0,value:0,known:0};e.count++;if(x.value!==null){e.value+=x.value;e.known++}suppliers.set(x.supplier,e)}if(x.published){const k=x.published.slice(0,7),e=months.get(k)||{month:k,count:0,value:0,known:0};e.count++;if(x.value!==null){e.value+=x.value;e.known++}months.set(k,e)}}
 const known=items.filter(x=>x.value!==null);
 const due=days=>items.filter(x=>x.end&&x.end>=reference&&x.end<=new Date(Date.parse(reference)+days*86400000).toISOString().slice(0,10)).length;
 return {items,summary:{count:items.length,known_values:known.length,value:known.length?known.reduce((a,x)=>a+x.value,0):null,due30:due(30),due60:due(60),due90:due(90)},suppliers:[...suppliers.values()].sort((a,b)=>b.count-a.count).slice(0,10),months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),coverage:{page:f.page,page_size:50,received:raw.length,total_pages:Number(body?.totalPaginas)||0,total_records:Number(body?.totalRegistros)||0,local_filters:true,complete:false},generated_at:new Date().toISOString(),source:'PNCP /v1/contratos — publicação por período; filtros aplicados somente à página consultada. Vencimento não garante nova contratação.'};
}
export async function contracts(params,fetchPage=null,onPage=null){
 const f=contractParams(params),data=[],pages=[],failed=[];fetchPage=fetchPage||(f.kind==='ata'?fetchPncpAtaPage:fetchPncpContractPage);let totalPages=0,totalRecords=0,archiveSaved=0,archiveOmitted=0,archiveErrors=0;
 for(let p=f.page;p<Math.min(10001,f.page+f.batch);p++){
  if(p>f.page&&p>totalPages)break;
  try{const body=await fetchPage({...f,page:p});data.push(...(Array.isArray(body?.data)?body.data:Array.isArray(body)?body:[]));totalPages=Number(body?.totalPaginas)||0;totalRecords=Number(body?.totalRegistros)||0;pages.push(p);if(onPage&&f.kind==='contract'){try{const normalized=contractView(body,{...f,uf:'',keyword:'',supplier:'',org:'',validity:'all',expiry:0,min:null,max:null});const saved=await onPage(normalized.items,{start:f.start,end:f.end,page:p,received:normalized.coverage.received,total_pages:totalPages});archiveSaved+=saved.archived;archiveOmitted+=saved.omitted}catch(e){archiveErrors++;console.error('market archive page:',e.message)}}}
  catch(error){if(!pages.length)throw error;failed.push(p);break}
 }
 const result=contractView({data,totalPaginas:totalPages,totalRegistros:totalRecords},f);
 result.archive={saved:archiveSaved,omitted:archiveOmitted,errors:archiveErrors};
 result.coverage={...result.coverage,pages,failed_pages:failed,last_page:pages.at(-1)||f.page,next_page:failed[0]??(pages.at(-1)||f.page)+1,complete:false};
 result.source=(f.kind==='ata'?'PNCP /v1/atas — período de vigência':'PNCP /v1/contratos — período de publicação')+'; filtros aplicados às páginas consultadas. Vigência por datas informadas; confira cancelamento, extinção e aditivos no registro oficial.';
 return result;
}
