"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {addDays,projectDailyCashflow,evaluateHealth}=require("../lib/forecast-core");
test("data UTC adiciona dias corretamente",()=>assert.equal(addDays("2026-11-22",8),"2026-11-30"));
test("despesa maior que saldo resulta em saldo negativo",()=>{const f=projectDailyCashflow("2026-11-22",1000,90,[{kind:"expense",date:"2026-11-22",amount:1300}]);assert.equal(f.snapshots[30],-300);assert.equal(f.firstNegativeDate,"2026-11-22");});
test("entradas pendentes atualizam projeções 30/60/90",()=>{const f=projectDailyCashflow("2026-11-22",100,90,[{kind:"income",date:"2026-12-30",amount:500}]);assert.equal(f.snapshots[30],100);assert.equal(f.snapshots[60],600);assert.equal(f.snapshots[90],600);});
test("vencimento anterior é considerado hoje",()=>{const f=projectDailyCashflow("2026-11-22",1000,90,[{kind:"expense",date:"2026-11-10",amount:200}]);assert.equal(f.daily[0].balance,800);});
test("transferência interna não muda saldo consolidado",()=>{const f=projectDailyCashflow("2026-11-22",1000,90,[{kind:"transfer",date:"2026-11-23",amount:200}]);assert.equal(f.snapshots[30],1000);});
test("índice não inventa pontuação para ausência de dados",()=>{const f=projectDailyCashflow("2026-11-22",0,90,[]);assert.equal(evaluateHealth({balance:0,forecast:f,income:0,expenses:0,hasAccounts:false,hasMovements:false}).score,null);});
