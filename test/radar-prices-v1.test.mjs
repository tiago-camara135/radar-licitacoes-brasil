import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {priceQuery,buildPriceReport,__priceTest} from '../radar-prices-v1.mjs';
import {pricePdf,priceExcel} from '../radar-price-export-v1.mjs';
import {createPncpTransport} from '../pncp-transport-v1.mjs';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const body=(tokens=[],unit='UN')=>({agency:'Órgão QA',responsible:'Responsável QA',object:'Pesquisa QA',method:'median',confirmed:true,items:[{description:'Item QA',unit,quantity:10,tokens}]});
const record=(n,price=Number(n)*2,unit='UNIDADE')=>({key:'qa'+n,process:'process'+n,source:'Fixture isolada',description:'Item QA',unit,price,quantity:10,date:day(),org:'Órgão QA',uf:'RN',reference:'ref'+n,url:'https://pncp.gov.br/app/editais/12345678000199/2026/1',accessed_at:new Date().toISOString()});
const signed=(n,price,unit)=>__priceTest.pack(42,record(n,price,unit));
test('price report requires distinct official evidence and calculates multi-item estimates',()=>{
 const tokens=[signed(1,8),signed(2,10),signed(3,20)];const b=body(tokens);b.items.push({description:'Item 2',unit:'UN',quantity:2,tokens});
 const r=buildPriceReport(42,b);assert.equal(r.ready,true);assert.equal(r.items[0].median,10);assert.equal(r.items[0].mean,38/3);assert.equal(r.total,120);
 const partial=buildPriceReport(42,body(tokens.slice(0,2)));assert.equal(partial.ready,false);assert.equal(partial.items[0].estimate,null);assert.equal(partial.total,null);
 assert.throws(()=>buildPriceReport(43,b),/sessão/);
 assert.throws(()=>buildPriceReport(42,body([tokens[0],tokens[0],tokens[1]])),/contratação/);
 assert.throws(()=>buildPriceReport(42,body(tokens,'KG')),/incompatível/);
 assert.throws(()=>buildPriceReport(42,body([tokens[0]+'x'])),/verificada|inválida/);
 assert.throws(()=>buildPriceReport(42,{...b,confirmed:false}),/confirme/);
});
test('native PDF and Excel exports include source references and real numeric cells',async()=>{
 const r=buildPriceReport(42,body([signed(1,8),signed(2,10),signed(3,20)]));
 const pdf=await pricePdf(r);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>1500);
 const xlsx=await priceExcel(r);assert.equal(xlsx.subarray(0,2).toString(),'PK');const w=new ExcelJS.Workbook();await w.xlsx.load(xlsx);
 assert.equal(w.getWorksheet('Pesquisa').getCell('I2').value,10);assert.equal(w.getWorksheet('Referências').getCell('F2').value,8);assert.equal(w.getWorksheet('Referências').getCell('M2').value,r.items[0].refs[0].url);
});
test('PNCP search uses ufs and never assumes location',async()=>{
 const p=new URLSearchParams('mode=search&kind=ata&q=alimentos&uf=RN');
 const d=await priceQuery(42,p,async u=>{assert.equal(new URL(u).searchParams.get('ufs'),'RN');return {total:2,items:[{document_type:'ata',numero_controle_pncp:'12345678000199-1-000001/2026-000001',uf:'RN'},{document_type:'ata',numero_controle_pncp:'12345678000199-1-000002/2026-000001',uf:'SP'}]}});
 assert.equal(d.rows.length,1);assert.ok(d.rows[0].ata_url.endsWith('/2026/1/1'));
});
test('Compras.gov material and service use verified API signatures and exclude invalid rows',async()=>{
 const common={codigoItemCatalogo:99,idCompra:'12345606000012026',idItemCompra:123,quantidade:10,precoUnitario:8,dataResultado:day(),nomeUnidadeMedida:'UNIDADE',descricaoItem:'Item QA'};
 const d=await priceQuery(42,new URLSearchParams('mode=catalog&type=material&code=99'),async u=>{const p=new URL(u).searchParams;assert.equal(p.get('tipo'),'codigoItemCatalogo');assert.equal(p.get('codigo'),'99');return {resultado:[common,{...common,precoUnitario:0},{...common,codigoItemCatalogo:88}],totalRegistros:3}});
 assert.equal(d.rows.length,1);assert.equal(d.rows[0].price,8);assert.ok(d.rows[0].token);
 const s=await priceQuery(42,new URLSearchParams('mode=catalog&type=service&code=99'),async u=>{assert.equal(new URL(u).searchParams.get('codigoItemCatalogo'),'99');return {resultado:[common]}});assert.equal(s.rows[0].unit,'UNIDADE');
});
test('ata price must be directly linked to registered item and confirmed unit; rejects excluded rows',async()=>{
 const id='12345678000199-1-000001/2026-000001';const raw={numeroControlePncpAta:id,numeroItem:'00008',itemExcluido:false,classificacaoFornecedor:'001',percentualMaiorDesconto:0,valorUnitario:9.9,quantidadeHomologadaVencedor:10,dataAssinatura:day()};
 const d=await priceQuery(42,new URLSearchParams({mode:'ata-prices',control:id,item:'8'}),async u=>u.includes('consultarARPItem')?{resultado:[raw,{...raw,itemExcluido:true},{...raw,numeroItem:'00009'}]}:u.endsWith('/atas/1')?{numeroControlePNCP:id,cancelado:false,dataVigenciaInicio:day(),dataVigenciaFim:'2099-01-01',unidadeOrgao:{ufSigla:'RN'}}:{numeroItem:8,descricao:'Item QA',unidadeMedida:'Frasco 75,00 ML'});
 assert.equal(d.rows.length,1);assert.equal(d.rows[0].price,9.9);assert.equal(d.rows[0].unit,'Frasco 75,00 ML');assert.ok(d.rows[0].ata_url);
});
test('PNCP homologated result excludes cancelled, zero and missing quantities and is not labelled as ata',async()=>{
 const id='12345678000199-1-000001/2026';const raw={numeroItem:1,situacaoCompraItemResultadoId:1,valorUnitarioHomologado:7,quantidadeHomologada:10,dataResultado:day(),sequencialResultado:1};
 const d=await priceQuery(42,new URLSearchParams({mode:'pncp-price',control:id+'-000001',item:'1'}),async u=>u.endsWith('/resultados')?[raw,{...raw,sequencialResultado:2,quantidadeHomologada:0},{...raw,sequencialResultado:3,situacaoCompraItemResultadoId:2}]:u.includes('/api/consulta/')?{numeroControlePNCP:id}: {numeroItem:1,unidadeMedida:'KG',descricao:'Item QA',criterioJulgamentoId:1});
 assert.equal(d.rows.length,1);assert.equal(d.rows[0].ata_url,null);assert.equal(d.rows[0].price,7);assert.match(d.warning,/não preço/);
});
test('transport preserves strict default shape and supports explicitly opted-in official detail objects',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({numeroControlePNCP:'abc'}),{status:200});
 await assert.rejects(createPncpTransport({fetcher,maxRetries:0}).get('https://pncp.gov.br/x'),/sem lista/);
 const r=await createPncpTransport({fetcher,maxRetries:0,acceptBody:b=>b&&typeof b==='object'}).get('https://pncp.gov.br/x');assert.equal(r.body.numeroControlePNCP,'abc');
});
