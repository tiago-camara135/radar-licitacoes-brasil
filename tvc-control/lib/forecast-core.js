"use strict";
function addDays(date,days){const d=new Date(String(date).slice(0,10)+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function projectDailyCashflow(startDate,startBalance,days,movements){
 const n=Number(days);if(!Number.isInteger(n)||n<1||n>365)throw Error("Período inválido");
 const totalByDate=new Map();
 for(const movement of movements){const original=String(movement.date).slice(0,10);const date=original<startDate?startDate:original;if(date>addDays(startDate,n))continue;const signed=movement.kind==="income"?Number(movement.amount):movement.kind==="expense"?-Number(movement.amount):0;if(!Number.isFinite(signed))throw Error("Valor de movimentação inválido");totalByDate.set(date,(totalByDate.get(date)||0)+signed);}
 const daily=[];let balance=Number(startBalance),firstNegativeDate=null,minBalance=balance;
 for(let i=0;i<=n;i++){const date=addDays(startDate,i);balance=Math.round((balance+(totalByDate.get(date)||0))*100)/100;if(balance<minBalance)minBalance=balance;if(balance<0&&!firstNegativeDate)firstNegativeDate=date;daily.push({day:i,date,balance});}
 return {daily,minBalance,firstNegativeDate,snapshots:{30:daily[Math.min(30,n)].balance,60:daily[Math.min(60,n)].balance,90:daily[Math.min(90,n)].balance}};
}
function evaluateHealth({balance,forecast,income,expenses,hasAccounts,hasMovements}){
 if(!hasAccounts||(!hasMovements&&balance===0))return {score:null,level:"Sem dados",method:"Pontuação baseada em saldos e compromissos cadastrados"};
 let score=100;
 if(balance<0)score-=30;
 if(forecast.firstNegativeDate)score-=25;
 if(forecast.snapshots[30]<0)score-=20;
 if(forecast.snapshots[60]<0)score-=10;
 if(forecast.snapshots[90]<0)score-=10;
 if(expenses>Math.max(0,balance)+income)score-=5;
 score=Math.max(0,Math.min(100,score));
 return {score,level:score>=80?"Estável":score>=55?"Atenção":"Crítico",method:"Pontuação indicativa por regras: saldo atual, riscos em 30/60/90 dias e compromissos"};
}
module.exports={addDays,projectDailyCashflow,evaluateHealth};
