"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {advanceRecurringDate,recurrenceDatesInRange,buildRecurringForecast,allocateInstallments}=require("../lib/financial-core");
test("parcelamento conserva total",()=>{let a=allocateInstallments(100,3);assert.deepEqual(a,[33.34,33.33,33.33]);assert.equal(Math.round(a.reduce((s,n)=>s+n,0)*100),10000);});
test("parcelas não multiplicam a compra",()=>assert.deepEqual(allocateInstallments(1500,3),[500,500,500]));
test("recorrência semanal avança sete dias",()=>assert.equal(advanceRecurringDate("2026-11-22","weekly"),"2026-11-29"));
test("previsão fixa se restringe ao mês",()=>{const r={id:"r",amount:900,frequency:"monthly",next_due:"2026-08-10",description:"Aluguel"};assert.equal(buildRecurringForecast(r,"2026-11-01","2026-12-01").period_total,900);});
test("ocorrências geradas não descontam duas vezes",()=>{const r={id:"r",amount:900,frequency:"monthly",next_due:"2026-11-10",description:"Aluguel"};assert.equal(buildRecurringForecast(r,"2026-11-01","2026-12-01",new Set(["r:2026-11-10"])).period_total,0);});
test("recorrência semanal prevê todas as datas",()=>{const r={id:"w",amount:30,frequency:"weekly",next_due:"2026-11-01",description:"Semanal"};assert.equal(recurrenceDatesInRange(r,"2026-11-01","2026-12-01").length,5);});
