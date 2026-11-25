import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {createPncpTransport} from './pncp-transport-v1.mjs';
const bad=message=>Object.assign(new Error(message),{status:400});
const clean=(v,n=600)=>String(v??'').trim().slice(0,n);
const fold=v=>clean(v,2000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const positive=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))&&Number.isFinite(Date.parse(v))?v:null;
const transport=createPncpTransport({spacing:550,maxConcurrent:2,maxRetries:0,timeoutMs:12000,acceptBody:b=>b&&typeof b==='object'});
const get=async u=>(await transport.get(u)).body;
const ufs={RO:11,AC:12,AM:13,RR:14,PA:15,AP:16,TO:17,MA:21,PI:22,CE:23,RN:24,PB:25,PE:26,AL:27,SE:28,BA:29,MG:31,ES:32,RJ:33,SP:35,PR:41,SC:42,RS:43,MS:50,MT:51,GO:52,DF:53};
const groups=[['alimento','alimentos','alimenticios','alimentacao','generos alimenticios','merenda escolar'],['medicamento','medicamentos','farmacos','produtos farmaceuticos'],['pneu','pneus','pneumaticos'],['limpeza','higienizacao','saneantes'],['material de construcao','materiais de construcao','insumos de construcao'],['computador','computadores','microcomputadores'],['locacao','aluguel']];
export function smartTerms(q){const s=fold(q).trim();if(s.length<3)return [];const result=[clean(q,180)];for(const g of groups){if(g.some(t=>new RegExp('(?:^|\\s)'+t+'(?:$|\\s)').test(s))){for(const t of g){if(t!==s&&result.length<4)result.push(t)}break}}return [...new Set(result)]}
export function criticalStats(values){
 const a=values.filter(v=>Number.isFinite(v)&&v>0).sort((x,y)=>x-y),n=a.length;
 if(!n)return {sd:null,cv:null,q1:null,q3:null,low:null,high:null,flags:[]};
 const mean=a.reduce((s,v)=>s+v,0)/n,sd=n>1?Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/(n-1)):null;
 const q=p=>{const i=(n-1)*p,j=Math.floor(i);return a[j]+(a[Math.min(j+1,n-1)]-a[j])*(i-j)};
 const q1=n>=4?q(.25):null,q3=n>=4?q(.75):null,iqr=q1===null?null:q3-q1,low=iqr===null?null:q1-1.5*iqr,high=iqr===null?null:q3+1.5*iqr;
 return {sd,cv:sd===null?null:100*sd/mean,q1,q3,low,high,flags:low===null?[]:a.filter(v=>v<low||v>high)};
}
function safeZip(buf){if(buf.length>2_000_000||buf.length<22||buf.readUInt32LE(0)!==0x04034b50)throw bad('Envie XLSX de até 2 MB.');let e=-1;for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50&&i+22+buf.readUInt16LE(i+20)===buf.length){e=i;break}if(e<0)throw bad('XLSX inválido.');let p=buf.readUInt32LE(e+16),n=buf.readUInt16LE(e+10),total=0;if(n>300||p>=e)throw bad('Planilha muito complexa.');for(let i=0;i<n;i++){if(p+46>e||buf.readUInt32LE(p)!==0x02014b50)throw bad('XLSX inválido.');total+=buf.readUInt32LE(p+24);if(total>24_000_000)throw bad('Planilha descompactada excede o limite.');p+=46+buf.readUInt16LE(p+28)+buf.readUInt16LE(p+30)+buf.readUInt16LE(p+32)}if(p>e)throw bad('XLSX inválido.')}
export async function importDemand(body){
 if(typeof body?.file!=='string'||body.file.length>2_700_000)throw bad('Arquivo inválido ou muito grande.');
 const buf=Buffer.from(body.file,'base64');safeZip(buf);const w=new ExcelJS.Workbook();try{await w.xlsx.load(buf)}catch{throw bad('Não foi possível ler o XLSX.')}
 const sheet=w.worksheets[0];if(!sheet||sheet.rowCount>101)throw bad('Primeira aba deve conter até 100 linhas, com cabeçalho.');
 const cols={};sheet.getRow(1).eachCell((cell,i)=>{const v=fold(cell.text).trim();if(['descricao','especificacao','item'].includes(v))cols.description=i;if(['unidade','unidade de fornecimento','un'].includes(v))cols.unit=i;if(['quantidade','qtd','qtde'].includes(v))cols.quantity=i;if(['catmat','catser','codigo'].includes(v))cols.catalog=i});
 if(!cols.description||!cols.unit||!cols.quantity)throw bad('Use cabeçalhos Descrição, Unidade, Quantidade; Código é opcional.');
 const rows=[];for(let i=2;i<=sheet.rowCount;i++){const r=sheet.getRow(i),d=r.getCell(cols.description),u=r.getCell(cols.unit),q=r.getCell(cols.quantity);if([d,u,q].every(x=>x.value===null||x.value===''))continue;
 if([d,u,q].some(x=>x.value&&typeof x.value==='object'))throw bad('Use valores simples, sem fórmulas, na linha '+i+'.');
 const description=clean(d.value),unit=clean(u.value,100),quantity=positive(typeof q.value==='string'?q.value.replace(',','.'):q.value),catalog=cols.catalog?clean(r.getCell(cols.catalog).text,20):'';
 if(!description||!unit||!quantity||quantity>1e9||catalog&&!/^\d+$/.test(catalog))throw bad('Confira descrição, unidade, quantidade e código na linha '+i+'.');rows.push({description,unit,quantity,catalog});
 }if(!rows.length||rows.length>30)throw bad('Importe de 1 a 30 itens por pesquisa.');return {rows,warning:'Somente dados da demanda importados; nenhum preço foi considerado oficial.'};
}
export async function initPriceHistory(pool){await pool.query('CREATE TABLE IF NOT EXISTS radar_price_history(id bigserial PRIMARY KEY,user_id bigint NOT NULL,report jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now())');await pool.query('CREATE INDEX IF NOT EXISTS radar_price_history_owner ON radar_price_history(user_id,created_at DESC)')}
export async function priceHistory(pool,uid,id,report){
 await initPriceHistory(pool);
 if(report){const r=await pool.query('INSERT INTO radar_price_history(user_id,report) VALUES($1,$2::jsonb) RETURNING id,created_at',[uid,JSON.stringify(report)]);return r.rows[0]}
 if(id){if(!/^\d{1,18}$/.test(String(id)))throw bad('Pesquisa inválida.');const r=await pool.query('SELECT id,report,created_at FROM radar_price_history WHERE id=$1 AND user_id=$2',[id,uid]);if(!r.rows[0])throw Object.assign(new Error('Pesquisa não encontrada.'),{status:404});return r.rows[0]}
 const r=await pool.query("SELECT id,created_at,report->>'object' object,report->>'agency' agency,report->>'date' date,report->>'ready' ready FROM radar_price_history WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[uid]);return {rows:r.rows};
}
export function documentDraft(report,kind){
 const section=(title,text)=>({title,text});
 const common=[section('Identificação','Órgão: '+report.agency+'\nResponsável: '+report.responsible+'\nObjeto: '+report.object),section('Quantitativos e estimativa',report.items.map(i=>i.number+'. '+i.description+' | '+i.quantity+' '+i.unit+' | '+(i.estimate===null?'Estimativa pendente':i.estimate.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}))).join('\n')),section('Pesquisa e metodologia','Método: '+report.method+'. Referências selecionadas: '+report.items.reduce((n,i)=>n+i.count,0)+'. '+report.warning)];
 if(kind==='etp')return {title:'Minuta de Estudo Técnico Preliminar',sections:[...common,section('Necessidade e problema público','[Preencher motivação, interesse público e demanda]'),section('Planejamento e requisitos','[Preencher alinhamento ao PCA, requisitos, memória de cálculo e justificativas]'),section('Levantamento de mercado e solução','[Comparar alternativas, viabilidade, parcelamento e contratações correlatas]'),section('Resultados e impactos','[Preencher providências prévias, resultados pretendidos e impactos ambientais]'),section('Conclusão','[Responsável deve fundamentar a viabilidade da contratação]')]};
 if(kind==='tr')return {title:'Minuta de Termo de Referência',sections:[...common,section('Fundamentação e solução','[Indicar ETP, justificativa, natureza e prazo da contratação]'),section('Requisitos e execução','[Preencher especificações, locais, prazos, condições de entrega e recebimento]'),section('Gestão, fiscalização e pagamento','[Definir critérios de medição, pagamento e gestão contratual]'),section('Seleção e orçamento','[Definir critérios de seleção, habilitação, adequação orçamentária e condições]')]};
 if(kind==='justification')return {title:'Minuta de justificativa de pesquisa de preços',sections:[...common,section('Critérios de seleção e análise crítica','[Justificar equivalência, quantitativos, condições, exclusões e método escolhido]'),section('Conclusão','[Validar fontes e justificar suficiência, inclusive eventuais exceções legais]')]};
 throw bad('Documento inválido.');
}
export async function healthSearch(p,fetchOfficial=get){
 const code=clean(p.get('code'),15),uf=clean(p.get('uf'),2).toUpperCase(),page=Number(p.get('page')||1);
 if(!/^\d{1,9}$/.test(code)||uf&&!ufs[uf]||!Number.isInteger(page)||page<1||page>100)throw bad('Informe CATMAT, UF opcional e página válida.');
 const u='https://apidadosabertos.saude.gov.br/economia-da-saude/bps?'+new URLSearchParams({codigoCatmat:code,pagina:String(page),tamanhoPagina:'50',...(uf?{estado:uf}:{}),ordenacao:'dataCompra desc'});
 const b=await fetchOfficial(u);if(!Array.isArray(b?.bps))throw Object.assign(new Error('BPS retornou formato não reconhecido.'),{status:503});
 const rows=[];for(const z of b.bps){if(String(z.codigoCatmat)!==code||uf&&z.estado!==uf||!positive(z.precoUnitario)||!positive(z.quantidade)||!date(z.dataCompra)||!clean(z.unidadeFornecimento))continue;const org=clean(z.nomeInstituicao,250),cnpj=clean(z.cnpjInstituicao,14),process=clean(z.numeroProcessoCompra,100);const cap=positive(z.capacidade),measure=clean(z.unidadeMedidaCapacidade,60);rows.push({description:clean(z.descricaoItem,1200),unit:clean(z.unidadeFornecimento,100)+(cap&&measure?' '+cap+' '+measure:''),price:positive(z.precoUnitario),quantity:positive(z.quantidade),date:z.dataCompra,org,uf:clean(z.estado,2),catalog:code,reference:[cnpj,process,clean(z.numeroAta,80)].filter(Boolean).join(' / '),url:u,source:'BPS — Ministério da Saúde',process:process&&/^\d{14}$/.test(cnpj)?'bps:'+cnpj+':'+process:null,scope:clean(z.esfera,50),regime:clean(z.tipoCompra,100)});}
 return {rows,page,has_more:b.bps.length===50&&page<100,source:u,warning:'BPS contém compras públicas e privadas. Confira natureza da instituição, unidade, apresentação, condições e duplicidade com outros portais. Registros sem processo identificado não integram a cesta.'};
}
export async function engineeringSearch(p,fetchOfficial=get){
 const uf=clean(p.get('uf'),2).toUpperCase();if(!ufs[uf])throw bad('Selecione uma UF.');
 const u='https://apisidra.ibge.gov.br/values/t/2296/n3/'+ufs[uf]+'/v/48/p/last%201';
 const b=await fetchOfficial(u);if(!Array.isArray(b)||b.length<2)throw Object.assign(new Error('SINAPI sem resultado.'),{status:503});
 const rows=b.slice(1).filter(z=>String(z.D1C)===String(ufs[uf])&&String(z.D2C)==='48'&&positive(z.V)).map(z=>({uf,location:clean(z.D1N,100),period:clean(z.D3N,100),value:positive(z.V),unit:'R$/m²',source:u}));
 return {rows,warning:'Custo médio agregado do SINAPI/IBGE. Não é preço unitário de insumo nem composição. Consulte tabelas CAIXA e SICRO/DNIT para orçamento detalhado.'};
}
