"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(base,file),"utf8");
const css=read("public/styles.css"),js=read("public/app.js"),html=read("public/index.html"),worker=read("public/sw.js"),boot=read("public/theme-init.js");
test("todos os grupos de interface possuem versão escura",()=>{
 const sections=[".auth-form-side",".sidebar",".topbar",".welcome-row",".stat-card:not(.stat-main)",".panel",".chart-area",".dashboard-account-total",".data-table",".theme-choice",".mobile-nav",".mobile-more-menu",".modal-card",".forecast-panel",".forecast-chart-zone",".forecast-scenario",".calendar-event-row .table-action"];
 for(const selector of sections)assert.ok(css.includes("html[data-theme=dark] "+selector),"Faltou tema escuro: "+selector);
});
test("estados financeiros positivos e negativos mantêm contraste",()=>{
 assert.match(css,/html\[data-theme=dark\] \.stat-card:not\(\.stat-main\) \.stat-value\.positive/);
 assert.match(css,/html\[data-theme=dark\] \.stat-card:not\(\.stat-main\) \.stat-value\.negative/);
});
test("a preferência é aplicada antes da renderização",()=>{
 assert.ok(html.indexOf("theme-init.js")>=0);
 assert.ok(html.indexOf("theme-init.js")<html.indexOf("styles.css"));
 assert.match(boot,/document\.documentElement\.dataset\.theme/);
});
test("tema automático acompanha mudanças do sistema",()=>{
 assert.match(js,/systemThemeQuery\.addEventListener\("change"/);
 assert.match(js,/setTheme\("system",false\)/);
});
test("preferência da conta é usada no login",()=>{
 assert.match(js,/readThemeChoice\("tvc-theme-choice-v2-"\+m\.user\.id\)\|\|m\.user\.theme/);
});
test("PWA atualiza cache com recursos do tema",()=>{
 assert.ok(worker.includes("/theme-init.js?v=1"));
 assert.ok(worker.includes("styles.css?v=20"));
 assert.ok(html.includes("styles.css?v=20"));
});
test("nenhum ID HTML duplicado",()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length);
});
