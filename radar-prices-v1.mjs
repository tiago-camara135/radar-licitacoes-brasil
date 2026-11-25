import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {createPncpTransport} from './pncp-transport-v1.mjs';
const transport=createPncpTransport({spacing:500,maxConcurrent:2,maxRetries:0,timeoutMs:11000,acceptBody:b=>b&&typeof b==='object'});
const SECRET=randomBytes(32);
const bad=m=>Object.assign(new Error(m),{status:400});
const clean=(v,n=500)=>String(v??'').trim().slice(0,n);
const fold=v=>clean(v,2000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
const unit=v=>{const n=fold(v);return ({kg:'kg',quilo:'kg',quilograma:'kg',un:'un',und:'un',unidade:'un',l:'l',litro:'l'})[n]||n};
const positive=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
const date=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):null;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const list=b=>Array.isArray(b)?b:Array.isArray(b?.data)?b.data:Array.isArray(b?.resultado)?b.resultado:null;
const pncp='https://pncp.gov.br/api/pncp/v1/orgaos/';
const compras='https://dadosabertos.compras.gov.br';
const official=async url=>(await transport.get(url)).body;
function checkedList(body){const a=list(body);if(!a)throw Object.assign(new Error('Resposta oficial sem lista reconhecida.'),{status:503});return a}
function int(v,min=1,max=999999999){const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw bad('Identificador ou página inválida.');return n}
function control(v){const s=clean(v,80),m=s.match(/^(\d{14})-1-(\d{1,9})\/(\d{4})(?:-(\d{1,9}))?$/);if(!m)throw bad('Informe o número de controle PNCP de uma compra ou ata.');return {cnpj:m[1],seq:int(m[2]),year:int(m[3],2000,2100),ata:m[4]?int(m[4]):null,purchase:m[1]+'-1-'+String(Number(m[2])).padStart(6,'0')+'/'+m[3],id:s}}
function links(c){return {url:'https://pncp.gov.br/app/editais/'+c.cnpj+'/'+c.year+'/'+c.seq,ata_url:c.ata?'https://pncp.gov.br/app/atas/'+c.cnpj+'/'+c.year+'/'+c.seq+'/'+c.ata:null}}
const base=c=>pncp+c.cnpj+'/compras/'+c.year+'/'+c.seq;
function pack(uid,r){const payload=Buffer.from(JSON.stringify({uid:String(uid),expires:Date.now()+7200000,r})).toString('base64url');return payload+'.'+createHmac('sha256',SECRET).update(payload).digest('base64url')}
function unpack(uid,t){if(typeof t!=='string'||t.length>12000)throw bad('Referência inválida.');const [p,s,...rest]=t.split('.');if(!p||!s||rest.length)throw bad('Referência inválida.');const h=createHmac('sha256',SECRET).update(p).digest(),v=Buffer.from(s,'base64url');if(h.length!==v.length||!timingSafeEqual(h,v))throw bad('Referência não verificada.');let d;try{d=JSON.parse(Buffer.from(p,'base64url').toString())}catch{throw bad('Referência inválida.')}if(d.uid!==String(uid)||d.expires<Date.now())throw bad('Referência expirada ou de outra sessão. Consulte novamente.');return d.r}
const priceRow=(uid,r)=>({...r,token:pack(uid,r)});
function sourceRow(r){return { ...r,accessed_at:new Date().toISOString() }}
function federalRow(z,code,source){
 const purchase=typeof z.idCompra==='string'&&/^\d+$/.test(z.idCompra)?z.idCompra:typeof z.idCompraItem==='string'&&/^\d{20,25}$/.test(z.idCompraItem)?z.idCompraItem.slice(0,-5):null;
 const item=clean(z.idCompraItem||z.idItemCompra,80);
 const baseUnit=clean(z.nomeUnidadeFornecimento||z.siglaUnidadeFornecimento||z.nomeUnidadeMedida||z.siglaUnidadeMedida,100);
 const capacity=positive(z.capacidadeUnidadeFornecimento),measure=clean(z.nomeUnidadeMedida||z.siglaUnidadeMedida,60);
 const u=capacity&&measure?baseUnit+' '+capacity+' '+measure:baseUnit;
 if(String(z.codigoItemCatalogo)!==String(code)||!positive(z.precoUnitario)||!positive(z.quantidade)||!item||!purchase||!date(z.dataResultado)||Number(z.percentualMaiorDesconto||0)>0||!u)return null;
 return sourceRow({key:'compras:'+purchase+':'+item,process:'compras:'+purchase,source:'Compras.gov.br — preço praticado',description:clean(z.descricaoDetalhadaItem||z.descricaoItem,1200),unit:u,price:positive(z.precoUnitario),quantity:positive(z.quantidade),date:date(z.dataResultado),org:clean(z.nomeUasg||z.nomeOrgao,250),uf:clean(z.estado,2),supplier:clean(z.niFornecedor,20).replace(/\D/g,'').length===14?clean(z.nomeFornecedor,200):'',catalog:String(code),item:clean(z.numeroItemCompra,20),reference:item+' / compra '+purchase,url:source,ata_url:null,regime:clean(z.forma,30),validity:null})}
// Object-first discovery: preserve instrument identity and link only to validated purchase IDs.
const words=v=>fold(v).split(/[^a-z0-9]+/).filter(x=>x.length>1&&!['de','da','do','das','dos','para','com','em','tipo'].includes(x));
function matchTerms(term,description){const hay=fold(description);return words(term).every(w=>hay.includes(w))}
function documentRow(z,kind){
 const id=clean(z.numero_controle_pncp,80);
 let c=null,url=null;
 if(kind==='contrato'){
  const m=id.match(/^(\d{14})-2-(\d{1,9})\/(\d{4})$/);if(!m)return null;
  url='https://pncp.gov.br/app/contratos/'+m[1]+'/'+Number(m[3])+'/'+Number(m[2]);
  try{const linked=control(z.numero_contratacao);if(!linked.ata)c=linked}catch{}
 }else{try{c=control(id)}catch{return null}if((kind==='ata')!==Boolean(c.ata))return null;url=links(c).ata_url||links(c).url}
 const begin=date(z.data_inicio_vigencia),end=date(z.data_fim_vigencia),now=today();
 const validity=z.cancelado===true?'cancelled':!begin||!end||begin>end?'unknown':end<now?'expired':begin>now?'future':'active';
 return {id,control:c?.id||null,kind,description:clean(z.description,1200),title:clean(z.title,250),org:clean(z.orgao_nome,250),uf:clean(z.uf,2),municipality:clean(z.municipio_nome,120),published:date(z.data_publicacao_pncp),begin,end,validity,cancelled:z.cancelado===true,adhesion:kind==='ata'&&typeof z.permite_adesao==='boolean'?z.permite_adesao:null,url,ata_url:kind==='ata'?url:null,purchase_url:c?links(c).url:null};
}
async function objectSearch(p,get,page,uf){
 const q=clean(p.get('q'),180);if(q.length<3)throw bad('Digite pelo menos três caracteres do objeto.');
 const kind=p.get('kind')||'all',status=p.get('validity')||'all',adhesion=p.get('adhesion')==='1';
 if(!['all','edital','ata','contrato'].includes(kind)||!['all','active','expired','future','unknown','cancelled'].includes(status))throw bad('Filtro de documento ou vigência inválido.');
 const start=clean(p.get('from'),10),end=clean(p.get('to'),10);
 if(start&&date(start)!==start||end&&date(end)!==end||start&&end&&start>end)throw bad('Intervalo de publicação inválido.');
 const kinds=kind==='all'?['edital','ata','contrato']:[kind],pages=await Promise.allSettled(kinds.map(async k=>{
  const u='https://pncp.gov.br/api/search/?'+new URLSearchParams({q,tipos_documento:k,pagina:String(page),tam_pagina:'20',...(uf?{ufs:uf}:{})});
  const b=await get(u);if(!Array.isArray(b?.items))throw Error('Resposta oficial não reconhecida');
  return {kind:k,total:Number(b.total)||0,rows:b.items.filter(z=>z.document_type===k&&(!uf||z.uf===uf)).map(z=>documentRow(z,k)).filter(Boolean)};
 }));
 const successes=pages.filter(x=>x.status==='fulfilled').map(x=>x.value),failed=kinds.filter((_,i)=>pages[i].status==='rejected');
 if(!successes.length)throw Object.assign(new Error('Pesquisa oficial indisponível.'),{status:503});
 const rows=successes.flatMap(x=>x.rows).filter(r=>(status==='all'||r.kind!=='edital'&&r.validity===status)&&(!adhesion||r.kind==='ata'&&r.adhesion===true)&&(!start||r.published&&r.published>=start)&&(!end||r.published&&r.published<=end));
 const totals=Object.fromEntries(successes.map(s=>[s.kind,s.total]));
 return {mode:'object',rows,page,totals,failed,has_more:page<100&&successes.some(s=>s.total>page*20),warning:'Busca por objeto no índice oficial PNCP. Filtros de vigência e publicação aplicados à página recebida; avance mesmo se a página estiver vazia. Contratos podem não ter compra vinculada.'+(failed.length?' Fontes temporariamente indisponíveis: '+failed.join(', ')+'.':'')};
}
export async function priceQuery(uid,p,get=official){
 const mode=p.get('mode')||'search',page=int(p.get('page')||1,1,100),uf=clean(p.get('uf'),2).toUpperCase();if(uf&&!/^[A-Z]{2}$/.test(uf))throw bad('UF inválida.');
 if(mode==='object')return objectSearch(p,get,page,uf);
 if(mode==='search'){
  const q=clean(p.get('q'),180);if(q.length<3)throw bad('Digite pelo menos três caracteres.');
  const kind=p.get('kind')==='ata'?'ata':'edital';
  const u='https://pncp.gov.br/api/search/?'+new URLSearchParams({q,tipos_documento:kind,pagina:String(page),tam_pagina:'20',...(uf?{ufs:uf}:{})});
  const b=await get(u);if(!Array.isArray(b?.items))throw Object.assign(new Error('Busca oficial indisponível.'),{status:503});
  const rows=[];for(const z of b.items){if(z.document_type!==kind||uf&&z.uf!==uf)continue;let c;try{c=control(z.numero_controle_pncp)}catch{continue}if(kind==='ata'&&!c.ata)continue;rows.push({control:c.id,description:clean(z.description,1000),org:clean(z.orgao_nome,250),uf:clean(z.uf,2),begin:date(z.data_inicio_vigencia),end:date(z.data_fim_vigencia),cancelled:z.cancelado===true,...links(c)})}
  return {mode,rows,page,total:Number(b.total)||0,source:u};
 }
 if(mode==='catalog'){
  const code=int(p.get('code'),1,99999999),type=p.get('type')==='service'?'service':'material';
  const path=type==='service'?'/modulo-pesquisa-preco/3_consultarServico':'/modulo-pesquisa-preco/1_consultarMaterial';
  const u=compras+path+'?'+new URLSearchParams({pagina:String(page),tamanhoPagina:'50',...(type==='service'?{codigoItemCatalogo:String(code)}:{tipo:'codigoItemCatalogo',codigo:String(code)})});
  const b=await get(u);const rows=checkedList(b).map(z=>federalRow(z,code,u)).filter(z=>z&&(!uf||z.uf===uf)).map(z=>priceRow(uid,z));
  return {mode,rows,page,total:Number(b.totalRegistros)||0,source:u,warning:'Amostra de página oficial. Confira unidade, especificação, quantidade, data e condições.'};
 }
 const c=control(p.get('control')),b=base(c);
 if(mode==='items'){
  const source=checkedList(await get(b+'/itens?'+new URLSearchParams({pagina:String(page),tamanhoPagina:'50'})));const term=clean(p.get('term'),180);const rows=source.filter(z=>positive(z.numeroItem)&&(!term||matchTerms(term,z.descricao))).map(z=>({item:Number(z.numeroItem),description:clean(z.descricao,1200),unit:clean(z.unidadeMedida,100),catalog:clean(z.catalogoCodigoItem,30),type:z.materialOuServico==='S'?'service':z.materialOuServico==='M'?'material':null,has_result:z.temResultado===true,criterion:clean(z.criterioJulgamentoNome,80)}));
  return {mode,rows,page,has_more:source.length===50&&page<100,control:c.id,...links(c),warning:c.ata?'Itens da compra de origem, não necessariamente integrantes desta ata. Use preços registrados para confirmar a vinculação.':''};
 }
 if(mode==='ata-items'){
  if(!c.ata)throw bad('Selecione uma ata de registro de preços.');
  const u=compras+'/modulo-arp/2.1_consultarARPItem_Id?'+new URLSearchParams({numeroControlePncpAta:c.id,pagina:String(page),tamanhoPagina:'50'});
  const [body,doc]=await Promise.all([get(u),get(b+'/atas/'+c.ata)]);
  if(doc?.numeroControlePNCP!==c.id)throw Object.assign(new Error('Ata não confirmada pelo PNCP.'),{status:503});
  const term=clean(p.get('term'),180),seen=new Set(),rows=[];
  for(const z of checkedList(body)){
   const item=Number(z.numeroItem);
   if(z.numeroControlePncpAta!==c.id||!Number.isInteger(item)||item<1||seen.has(item)||z.itemExcluido!==false||z.dataHoraExclusao||Number(z.classificacaoFornecedor)!==1||term&&!matchTerms(term,z.descricaoItem))continue;
   seen.add(item);rows.push({item,description:clean(z.descricaoItem,1200),catalog:clean(z.codigoItem,30),type:fold(z.tipoItem)==='servico'?'service':fold(z.tipoItem)==='material'?'material':null,unit:null,price:Number(z.percentualMaiorDesconto||0)===0?positive(z.valorUnitario):null,quantity:positive(z.quantidadeHomologadaVencedor)});
  }
  return {mode,rows,page,control:c.id,...links(c),has_more:page<100&&Number(body.totalPaginas)>page,warning:'Itens vinculados à ata no Compras.gov.br. Unidade e preço devem ser confirmados antes de adicionar a referência. Ausência de registros não prova inexistência de itens na ata.'};
 }
 if(mode==='ata-prices'){
  if(!c.ata)throw bad('Selecione uma ata de registro de preços.');
  const u=compras+'/modulo-arp/2.1_consultarARPItem_Id?'+new URLSearchParams({numeroControlePncpAta:c.id,pagina:String(page),tamanhoPagina:'50'});
  const a=checkedList(await get(u)),doc=await get(b+'/atas/'+c.ata);
  if(doc?.numeroControlePNCP!==c.id)throw Object.assign(new Error('Ata não confirmada pelo PNCP.'),{status:503});
  const item=int(p.get('item')),raw=await get(b+'/itens/'+item);if(Number(raw?.numeroItem)!==item||!clean(raw.unidadeMedida))throw bad('Unidade do item não confirmada no PNCP.');
  const rows=a.filter(z=>z.numeroControlePncpAta===c.id&&Number(z.numeroItem)===item&&z.itemExcluido===false&&!z.dataHoraExclusao&&Number(z.classificacaoFornecedor)===1&&Number(z.percentualMaiorDesconto||0)===0&&positive(z.valorUnitario)&&positive(z.quantidadeHomologadaVencedor)).map(z=>priceRow(uid,sourceRow({key:'ata:'+c.id+':'+item,process:'pncp:'+c.purchase,source:'Compras.gov.br — item de ata registrada',description:clean(raw.descricao,1200),unit:clean(raw.unidadeMedida,100),price:positive(z.valorUnitario),quantity:positive(z.quantidadeHomologadaVencedor),date:date(z.dataAssinatura),org:clean(doc.orgaoEntidade?.razaoSocial||z.nomeUnidadeGerenciadora,250),uf:clean(doc.unidadeOrgao?.ufSigla,2),supplier:clean(z.niFornecedor,20).replace(/\D/g,'').length===14?clean(z.nomeRazaoSocialFornecedor,200):'',catalog:clean(z.codigoItem,30),item:String(item),reference:c.id+' / item '+item,url:u,ata_url:links(c).ata_url,regime:'SRP',validity:{begin:date(doc.dataVigenciaInicio),end:date(doc.dataVigenciaFim),cancelled:doc.cancelado===true}})));
  return {mode,rows:rows.filter(z=>!uf||z.uf===uf),page,warning:'Preço registrado vinculado à ata; confira documento, alterações e unidade. Nenhum resultado não significa ausência de ata.'};
 }
 if(mode!=='pncp-price')throw bad('Consulta inválida.');
 const item=int(p.get('item')),raw=await get(b+'/itens/'+item);if(Number(raw?.numeroItem)!==item||!clean(raw.unidadeMedida)||Number(raw.criterioJulgamentoId)===2)throw bad('Item ou unidade não confirmados, ou critério por desconto.');
 const purchase=await get('https://pncp.gov.br/api/consulta/v1/orgaos/'+c.cnpj+'/compras/'+c.year+'/'+c.seq);if(purchase?.numeroControlePNCP!==c.purchase)throw Object.assign(new Error('Compra não confirmada pelo PNCP.'),{status:503});
 const u=b+'/itens/'+item+'/resultados';
 const rows=checkedList(await get(u)).filter(z=>Number(z.situacaoCompraItemResultadoId)===1&&!z.dataCancelamento&&(!z.moedaEstrangeira||z.moedaEstrangeira==='BRL')&&Number(z.numeroItem)===item&&Number(z.percentualDesconto||0)===0&&positive(z.valorUnitarioHomologado)&&positive(z.quantidadeHomologada)&&date(z.dataResultado)&&positive(z.sequencialResultado)).map(z=>priceRow(uid,sourceRow({key:'pncp:'+c.purchase+':'+item+':'+z.sequencialResultado,process:'pncp:'+c.purchase,source:'PNCP — resultado homologado',description:clean(raw.descricao,1200),unit:clean(raw.unidadeMedida,100),price:positive(z.valorUnitarioHomologado),quantity:positive(z.quantidadeHomologada),date:date(z.dataResultado),org:clean(purchase.orgaoEntidade?.razaoSocial,250),uf:clean(purchase.unidadeOrgao?.ufSigla,2),supplier:z.tipoPessoa==='PJ'&&clean(z.niFornecedor,20).replace(/\D/g,'').length===14?clean(z.nomeRazaoSocialFornecedor,200):'',catalog:clean(raw.catalogoCodigoItem,30),item:String(item),reference:c.purchase+' / item '+item+' / resultado '+z.sequencialResultado,url:u,ata_url:null,regime:'',validity:null})));
 return {mode,rows:rows.filter(z=>!uf||z.uf===uf),warning:c.ata?'Resultado homologado da compra, não preço confirmado da ata.':''};
}
export function buildPriceReport(uid,body){
 const object=clean(body?.object,600),agency=clean(body?.agency,250),responsible=clean(body?.responsible,200),notes=clean(body?.notes,2000),method=body?.method;
 if(!object||!agency||!responsible||!['median','mean','min'].includes(method)||body?.confirmed!==true||!Array.isArray(body.items)||!body.items.length||body.items.length>30)throw bad('Informe órgão, responsável, objeto, método e confirme a análise de comparabilidade (até 30 itens).');
 if(body.items.reduce((n,i)=>n+(Array.isArray(i?.tokens)?i.tokens.length:0),0)>200)throw bad('Limite de 200 referências por relatório.');
 const asOf=today(),cut=new Date(asOf+'T00:00:00Z');cut.setUTCFullYear(cut.getUTCFullYear()-1);const cutoff=cut.toISOString().slice(0,10);
 const items=body.items.map((it,i)=>{
  const description=clean(it.description,600),u=clean(it.unit,100),quantity=positive(it.quantity);
  if(!description||!u||!quantity||quantity>1e9||!Array.isArray(it.tokens)||it.tokens.length>30)throw bad('Dados inválidos no item '+(i+1)+'.');
  const refs=it.tokens.map(t=>unpack(uid,t));const processes=new Set(),unique=new Set();
  for(const r of refs){if(unique.has(r.key)||processes.has(r.process))throw bad('Use somente uma referência por contratação no item '+(i+1)+'.');unique.add(r.key);processes.add(r.process);
   if(unit(r.unit)!==unit(u)||!positive(r.price)||!r.date||r.date>asOf||r.date<cutoff||r.validity?.cancelled)throw bad('Referência incompatível, cancelada ou fora de 12 meses no item '+(i+1)+'.');
  }
  // Cross-system duplicate review is required; source ids may not align.
  const values=refs.map(r=>r.price).sort((a,b)=>a-b),n=values.length,ready=n>=3;
  const mean=n?values.reduce((a,b)=>a+b,0)/n:null,median=n?(values[(n-1)>>1]+values[n>>1])/2:null;
  const estimate=ready?({median,mean,min:values[0]})[method]:null;
  return {number:i+1,description,unit:u,quantity,notes:clean(it.notes,500),refs,count:n,min:n?values[0]:null,max:n?values[n-1]:null,mean,median,estimate,total:estimate===null?null:Math.round((estimate*quantity+Number.EPSILON)*100)/100,ready}
 });
 return {object,agency,responsible,notes,method,date:asOf,generated_at:new Date().toISOString(),items,ready:items.every(i=>i.ready),total:items.every(i=>i.ready)?items.reduce((s,i)=>s+i.total,0):null,warning:'Pesquisa preliminar. Valores nominais de fontes oficiais; não houve correção monetária automática. Responsável deve conferir especificação, unidade, escala, local, condições, alterações da ata, duplicidades entre fontes, excluir discrepâncias justificadamente e observar regulamento aplicável. Não substitui análise administrativa.'};
}
export const __priceTest={unit,control,pack,unpack};
