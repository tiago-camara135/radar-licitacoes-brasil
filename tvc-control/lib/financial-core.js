"use strict";
function moneyCents(value){const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error("Valor inválido");return Math.round((n+Number.EPSILON)*100);}
function advanceRecurringDate(date,frequency){
 const [year,month,day]=String(date).slice(0,10).split("-").map(Number);
 if(frequency==="weekly")return new Date(Date.UTC(year,month-1,day+7,12)).toISOString().slice(0,10);
 if(frequency==="monthly"){const monthIndex=month,nextYear=year+Math.floor(monthIndex/12),nextMonth=monthIndex%12,lastDay=new Date(Date.UTC(nextYear,nextMonth+1,0)).getUTCDate();return nextYear+"-"+String(nextMonth+1).padStart(2,"0")+"-"+String(Math.min(day,lastDay)).padStart(2,"0");}
 if(frequency==="yearly"){const nextYear=year+1,lastDay=new Date(Date.UTC(nextYear,month,0)).getUTCDate();return nextYear+"-"+String(month).padStart(2,"0")+"-"+String(Math.min(day,lastDay)).padStart(2,"0");}
 throw Error("Frequência recorrente inválida");
}
function recurrenceDatesInRange(rule,startInclusive,endExclusive){
 let due=String(rule.next_due).slice(0,10),iterations=0;const dates=[];
 while(due<startInclusive&&iterations<600){due=advanceRecurringDate(due,rule.frequency);iterations++;}
 while(due<endExclusive&&iterations<1200){dates.push(due);due=advanceRecurringDate(due,rule.frequency);iterations++;}
 return dates;
}
function buildRecurringForecast(rule,startInclusive,endExclusive,recordedKeys=new Set()){
 const amount=Number(rule.amount||0),nextDue=String(rule.next_due).slice(0,10);
 const dates=recurrenceDatesInRange(rule,startInclusive,endExclusive).filter(due=>!recordedKeys.has(String(rule.id)+":"+due));
 return {rule_id:rule.id,account_id:rule.account_id||null,description:rule.description,amount,frequency:rule.frequency,due_on:nextDue,account_name:rule.account_name,category_name:rule.category_name||"Sem categoria",occurrences:dates.length,period_total:dates.length*amount};
}
function allocateInstallments(total,count){
 const n=Number(count),cents=moneyCents(total);
 if(!Number.isInteger(n)||n<1||n>48||cents<n)throw Error("Valor ou número de parcelas inválido");
 const base=Math.floor(cents/n),remainder=cents-base*n;
 return Array.from({length:n},(_,i)=>(base+(i<remainder?1:0))/100);
}
module.exports={moneyCents,advanceRecurringDate,recurrenceDatesInRange,buildRecurringForecast,allocateInstallments};
