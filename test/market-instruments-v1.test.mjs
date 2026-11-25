import test from 'node:test';
import assert from 'node:assert/strict';
import {contractView,contracts,contractParams,instrumentValidity} from '../pulse-business-v1.mjs';
const ref='2026-11-24';
const contract=(id,begin,end,extra={})=>({numeroControlePNCP:id,dataVigenciaInicio:begin,dataVigenciaFim:end,objetoContrato:'Gêneros alimentícios',unidadeOrgao:{ufSigla:'RN'},...extra});
const ata=(id,begin,end,extra={})=>({numeroControlePNCP:id,dataVigenciaInicio:begin,dataVigenciaFim:end,objetoContratacao:'Gêneros alimentícios',unidadeOrgao:{ufSigla:'RN'},...extra});
const params=(kind,validity='all')=>({kind,validity,expiry:0,min:null,max:null,uf:'RN',keyword:'alimentos',supplier:'',org:'',page:1});
test('validity distinguishes current, expired, future, cancelled and incomplete dates',()=>{assert.equal(instrumentValidity('2026-01-01',ref,ref),'active');assert.equal(instrumentValidity('2025-01-01','2026-11-23',ref),'expired');assert.equal(instrumentValidity('2026-11-25','2027-01-01',ref),'future');assert.equal(instrumentValidity(null,ref,ref),'unknown');assert.equal(instrumentValidity(ref,'2025-01-01',ref),'unknown');assert.equal(instrumentValidity('2026-01-01',ref,ref,true),'cancelled')});
test('contract date filters use dates, not publication',()=>{const data=[contract('a','2026-01-01','2027-01-01'),contract('b','2024-01-01','2025-01-01'),contract('c','2027-01-01','2028-01-01')];for(const [status,id] of [['active','a'],['expired','b'],['future','c']])assert.deepEqual(contractView({data},{...params('contract',status),keyword:'aliment'},ref).items.map(x=>x.id),[id])});
test('ata date filters retain cancellation and do not invent suppliers or prices',()=>{const data=[ata('a','2026-01-01','2027-01-01'),ata('b','2025-01-01','2026-01-01'),ata('c','2026-01-01','2027-01-01',{cancelado:true})];for(const [status,id] of [['active','a'],['expired','b'],['cancelled','c']]){const d=contractView({data},{...params('ata',status),keyword:'aliment'},ref);assert.equal(d.items.length,1);assert.equal(d.items[0].id,id);assert.equal(d.items[0].value,null);assert.equal(d.items[0].supplier,null)}});
test('ata query never writes to contract archive',async()=>{const q=new URLSearchParams('kind=ata&start=2026-01-01&end=2026-01-10');let saved=0;const d=await contracts(q,async()=>({data:[ata('a','2026-01-01','2027-01-01')],totalPaginas:1}),async()=>{saved++});assert.equal(d.items.length,1);assert.equal(saved,0)});
test('invalid document and validity rejected; contract batches remain bounded',()=>{for(const extra of ['kind=invalid','validity=invalid','kind=ata&supplier=12345678000199'])assert.throws(()=>contractParams(new URLSearchParams('start=2026-01-01&end=2026-01-02&'+extra)));assert.throws(()=>contractParams(new URLSearchParams('start=2026-01-01&end=2026-03-01')))});

test('bulk PNCP ata fields and actual identifier format map to official link; UF is not assumed',async()=>{
 const raw={numeroControlePNCPAta:'10877412000168-1-000126/2026-000003',numeroControlePNCPCompra:'10877412000168-1-000126/2026',numeroAtaRegistroPreco:'00006',cnpjOrgao:'10877412000168',nomeOrgao:'IFRN',objetoContratacao:'Aquisição de gêneros alimentícios',vigenciaInicio:'2026-09-01',vigenciaFim:'2027-08-31',cancelado:false,possibilidadeAdesao:true};
 const v=contractView({data:[raw]},{...params('ata'),uf:'',keyword:'alimentos'},ref).items[0];
 assert.equal(v.validity,'active');assert.equal(v.uf,'');assert.equal(v.adhesion,true);assert.equal(v.url,'https://pncp.gov.br/app/atas/10877412000168/2026/126/3');
 const query=new URLSearchParams('kind=ata&start=2026-09-01&end=2026-09-02&uf=RN&keyword=alimentos');
 const d=await contracts(query,async()=>({data:[raw],totalPaginas:1}),null,async p=>{assert.deepEqual(p,{cnpj:'10877412000168',purchase:126,year:2026,sequence:3});return {numeroControlePNCP:raw.numeroControlePNCPAta,unidadeOrgao:{ufSigla:'RN'}}});
 assert.equal(d.items.length,1);assert.equal(d.items[0].uf,'RN');assert.equal(d.coverage.location_unverified,0);
 const failed=await contracts(query,async()=>({data:[raw],totalPaginas:1}),null,async()=>{throw Error('offline')});assert.equal(failed.items.length,0);assert.equal(failed.coverage.location_unverified,1);
});
test('organization-scoped contract pages never mark national archive coverage',async()=>{let saved=0;const d=await contracts(new URLSearchParams('start=2026-01-01&end=2026-01-02&org=10877412000168'),async()=>({data:[],totalPaginas:1}),async()=>{saved++});assert.equal(saved,0);assert.equal(d.archive.scoped,true)});
