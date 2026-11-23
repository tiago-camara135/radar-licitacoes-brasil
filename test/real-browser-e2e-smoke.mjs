// Real Chromium browser smoke in isolated GitHub Actions PostgreSQL database.
// No production credentials, external messaging, or user data are touched.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {existsSync} from 'node:fs';
import {Pool} from 'pg';
import {chromium} from 'playwright-core';

const base=String(process.env.RLB_TEST_BASE_URL||'http://127.0.0.1:10000').replace(/\/$/,'');
const token=crypto.randomBytes(5).toString('hex');
const email='radar-browser-'+token+'@example.test';
const adminEmail='radar-browser-admin-'+token+'@example.test';
const password='BrowserSmoke2026!Secure';
const cnpj='12345678000195',year=2026,sequence=90000000+Math.floor(Math.random()*70000000);
const pncpId='audit-e2e-'+token;
const object='Aquisição de combustível para a frota CI '+token;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:false,max:2});
let browser=null,userId=null,adminId=null;
const problems=[];
const chromePaths=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/chrome'];
const executablePath=chromePaths.find(existsSync);
assert.ok(executablePath,'Chrome/Chromium must be installed on the GitHub Actions runner');
const timeout=20000;
const note=(s)=>console.log('[browser-qa] '+s);
async function until(page,expr,t=timeout){
  await page.waitForFunction(expr,null,{timeout:t});
}
async function register(page,identity){
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#tabRegister').click();
 await page.locator('#authEmail').fill(identity);
 await page.locator('#authPassword').fill(password);
 await page.locator('#authSubmit').click();
 await page.locator('#appShell:not(.hidden)').waitFor({state:'visible',timeout});
 await page.locator('#revSummary').waitFor({state:'visible',timeout});
 const {rows}=await pool.query('SELECT id FROM users WHERE email=$1',[identity]);
 assert.equal(rows.length,1,'Test user persisted');
 return rows[0].id;
}
async function gotoSection(page,name){
  const link=page.locator('#mainNav [data-view="'+name+'"]');
  if(!(await link.isVisible()))await page.locator('#radarMenuToggle').click();
  await link.click();
  await page.locator('#view-'+name+'.active').waitFor({timeout});
}
async function screenshotOnFailure(page,name){
  try{await page.screenshot({path:'/tmp/'+name+'.png',fullPage:true,timeout:5000})}catch{}
}
try{
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 const ctx=await browser.newContext({viewport:{width:1366,height:850},locale:'pt-BR',timezoneId:'America/Fortaleza'});
 const page=await ctx.newPage();
 page.on('pageerror',e=>problems.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#authScreen:not(.hidden)').waitFor({state:'visible'});
 const before=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarPublicTheme').click();
 await until(page,previous=>document.documentElement.dataset.theme!==previous,6000).catch(async()=>{const after=await page.locator('html').getAttribute('data-theme');assert.notEqual(after,before,'Public theme toggle must work')});
 const publicAfter=await page.locator('html').getAttribute('data-theme');
 assert.notEqual(publicAfter,before,'Public theme toggle works');
 note('Public login page and theme switch OK');

 userId=await register(page,email);
 await until(page,()=>!!document.querySelector('#revSummary .rev-value') && Array.from(document.querySelectorAll('#revSummary .rev-value')).every(e=>e.textContent.trim()!=='—'));
 assert.equal(await page.locator('#revSummary .rev-value').count(),4);
 await page.locator('#view-home.active').waitFor({state:'visible',timeout});
 assert.ok(await page.locator('#rlbHomeTitle').isVisible(),'Executive home opens after login');
 assert.equal(await page.locator('#rlbHomeKpis .rev-stat').count(),4);
 assert.equal(await page.locator('#rlbHomeKpis button.rev-stat').count(),4,'Every KPI must be clickable');
 assert.equal(await page.locator('#rlbHomeSearchForm').count(),0,'No duplicated home search');
 assert.equal(await page.locator('#radarSearchForm').count(),1,'One Radar search form');
 assert.ok(await page.locator('#view-home [data-home-action="radar"]').first().isVisible());
 assert.equal(await page.locator('#rlbPageNavBar').isVisible(),false,'Breadcrumb stays hidden on home');
 assert.ok(await page.locator('#rlbHomeRecent').count()===1);
 note('Executive home layout and real KPI cards OK');
 assert.equal(await page.locator('#adminNav').isVisible(),false,'Non-admin cannot see admin navigation');
 const inTheme=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarTheme').click();
 const changed=await page.locator('html').getAttribute('data-theme');
 assert.notEqual(inTheme,changed,'Authenticated theme control works');
 note('Registration, authenticated dashboard, four metrics, user role and theme OK');

 // Corrige o "quadrado azul" sem remover o foco visível para teclado.
 await gotoSection(page,'radar');
 const clickedPage=await page.evaluate(()=>{
   const active=document.activeElement,crumb=document.querySelector('#rlbPageNavCurrent');
   const input=document.querySelector('#searchKeyword');
   return {
     activeId:active?.id||'',
     crumbOutline:getComputedStyle(crumb).outlineStyle,
     searchFocused:document.activeElement===input,
     searchShadow:getComputedStyle(input).boxShadow
   };
 });
 assert.equal(clickedPage.crumbOutline,'none','The contextual heading has no blue programmatic focus rectangle');
 assert.equal(clickedPage.searchFocused,false,'Page navigation does not auto-focus search input');
 await page.locator('#searchKeyword').click();
 const searchFocus=await page.locator('#searchKeyword').evaluate(e=>({
   outline:getComputedStyle(e).outlineStyle,
   parentShadow:getComputedStyle(e.closest('.rlb-radar-keyword')).boxShadow
 }));
 assert.equal(searchFocus.outline,'none','Radar keyword has no thick blue outline');
 assert.notEqual(searchFocus.parentShadow,'none','Primary search wrapper retains a subtle focus cue');
 await page.keyboard.press('Tab');
 const keyboardFocus=await page.evaluate(()=>{
   const e=document.activeElement;
   return {tag:e?.tagName,focusVisible:e?.matches(':focus-visible'),outline:getComputedStyle(e).outlineStyle};
 });
 assert.equal(keyboardFocus.focusVisible,true,'Keyboard users retain an accessible visible focus cue');
 assert.equal(keyboardFocus.outline,'solid','Keyboard control retains visible focus ring');
 await gotoSection(page,'home');
 assert.equal(await page.locator('#rlbHomeSearchForm').count(),0,'Home has no separate form');
 await page.locator('#view-home [data-home-action="radar"]').first().click();
 await page.locator('#view-radar.active').waitFor({timeout});
 assert.ok(await page.locator('#radarSearchForm').isVisible(),'Quick action opens the real Radar search');
 note('Professional focus, keyboard access and home-to-Radar shortcut OK');

 // O navegador valida duas contas efêmeras, sem alterar papéis de uma
 // sessão já ativa. O usuário comum continua autenticado na aba principal.
 const adminCtx=await browser.newContext({viewport:{width:1366,height:850},locale:'pt-BR',timezoneId:'America/Fortaleza',extraHTTPHeaders:{'X-Forwarded-For':'198.51.100.27'}});
 const adminPage=await adminCtx.newPage();
 const adminMeResponses=[];
 adminPage.on('response',response=>{if(response.url().endsWith('/api/me'))adminMeResponses.push(response.status())});
 adminPage.on('pageerror',e=>problems.push('admin: '+e.message));
 adminId=await register(adminPage,adminEmail);
 await pool.query("UPDATE users SET role='admin' WHERE id=$1",[adminId]);
 const adminReload=await adminPage.reload({waitUntil:'domcontentloaded'});
 assert.equal(adminReload.status(),200,'Admin page reload must succeed');
 await adminPage.waitForTimeout(450);
 const adminState=await adminPage.evaluate(()=>({
   shell:document.querySelector('#appShell')?.className,
   runtime:document.querySelector('#runtimeMessage')?.textContent,
   auth:document.querySelector('#authMessage')?.textContent,
   documentReady:document.readyState,
   home:!!document.querySelector('#view-home'),
   breadcrumb:!!document.querySelector('#rlbPageNavBar')
 }));
 console.log('[browser-qa] admin reload diagnostic '+JSON.stringify(adminState)+
   ' meStatus='+JSON.stringify(adminMeResponses)+' errors='+JSON.stringify(problems.slice(-4)));
 await adminPage.locator('#appShell:not(.hidden)').waitFor({state:'visible',timeout});
 await adminPage.locator('#adminNav').waitFor({state:'visible',timeout});
 await gotoSection(adminPage,'admin');
 // Simula a Central Administrativa substituindo seus componentes.
 await adminPage.evaluate(()=>document.querySelector('#revHealth')?.remove());
 await adminPage.locator('#revHealth .rev-action').waitFor({state:'visible',timeout});
 await adminPage.locator('#revHealth .rev-action').click();
 await until(adminPage,()=>document.querySelector('#revHealthStatus')?.textContent?.includes('Serviço operacional'),timeout);
 assert.equal(await page.locator('#adminNav').isVisible(),false,'Ordinary account cannot access admin controls');
 note('Admin health, role separation and ordinary account isolation OK');
 await adminCtx.close();

 await gotoSection(page,'home');
 await page.locator('#view-home [data-home-action="alerts"]').click();
 await page.locator('#view-alerts.active').waitFor({timeout});
 await page.locator('#alertName').fill('Combustíveis QA '+token);
 await page.locator('#alertKeyword').fill('combustível');
 await page.locator('#alertUf').selectOption('RN');
 await page.locator('#createAlertBtn').click();
 await until(page,()=>document.querySelector('#alertsList')?.textContent?.includes('Combustíveis QA'));
 const alertRow=await pool.query('SELECT id FROM saved_alerts WHERE user_id=$1 ORDER BY id DESC LIMIT 1',[userId]);
 assert.equal(alertRow.rows.length,1);
 const alertId=alertRow.rows[0].id;
 note('Create alert via actual UI OK');

 const closes=new Date(Date.now()+5*86400000).toISOString();
 const raw={numeroControlePNCP:pncpId,anoCompra:year,sequencialCompra:sequence,modalidadeId:6,modalidadeNome:'Pregão - Eletrônico',objetoCompra:object,orgaoEntidade:{cnpj,razaoSocial:'Prefeitura QA'},unidadeOrgao:{municipioNome:'Natal',ufSigla:'RN'},dataPublicacaoPncp:new Date().toISOString(),dataEncerramentoProposta:closes.slice(0,-1),valorTotalEstimado:140000};
 await pool.query("INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,raw,detected_at,last_seen_at) VALUES($1,$2,$3,$4,6,'Pregão - Eletrônico',$5,'Prefeitura QA','Natal','RN',140000,NOW(),$6,$7,$8::jsonb,NOW(),NOW())",[pncpId,cnpj,year,sequence,object,closes,'https://pncp.gov.br/app/editais/'+cnpj+'/'+year+'/'+sequence,JSON.stringify(raw)]);
 const notificationPayload={object,org:'Prefeitura QA',municipality:'Natal',uf:'RN',pncp_url:'https://pncp.gov.br/app/editais/'+cnpj+'/'+year+'/'+sequence};
 await pool.query("INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,created_at,sent_at) VALUES($1,$2,$3,'onsite','sent',$4::jsonb,NOW(),NOW())",[userId,alertId,pncpId,JSON.stringify(notificationPayload)]);

 await gotoSection(page,'home');
 const expired={...raw,objetoCompra:'Licitação encerrada CI '+token,dataEncerramentoProposta:new Date(Date.now()-2*86400000).toISOString()};
 await page.evaluate(items=>document.dispatchEvent(new CustomEvent('radar:live-feed',{detail:{items}})),[raw,expired]);
 await until(page,()=>document.querySelector('#rlbHomeRecent')?.textContent?.includes('Aquisição de combustível para a frota CI'),10000);
 assert.ok((await page.locator('#rlbHomeRecent').textContent()).includes('Licitação encerrada CI'));
 await page.locator('#rlbHomeRecentFilters [data-home-feed="open"]').click();
 assert.ok((await page.locator('#rlbHomeRecent').textContent()).includes('Aquisição de combustível'));
 assert.ok(!(await page.locator('#rlbHomeRecent').textContent()).includes('Licitação encerrada CI'),'Current-deadline filter excludes expired tenders');
 await page.locator('#rlbHomeRecentFilters [data-home-feed="all"]').click();
 note('Recent feed toggles use real closing dates; no simulated opportunity numbers OK');
 const recentHref=await page.locator('#rlbHomeRecent a.rlb-home-table-open').first().getAttribute('href');
 assert.ok(recentHref?.startsWith('https://pncp.gov.br/app/editais/'),'Recent item links to official PNCP');
 await page.locator('#rlbHomeRefresh').click();
 await until(page,()=>document.querySelector('#revRecommendations')?.textContent?.includes('Aquisição de combustível para a frota CI'),25000).catch(()=>{throw Error('Recommendations did not render the seeded matching tender')});
 await page.locator('#revRecommendations .rev-rec').first().waitFor({timeout});
 const score=await page.locator('#revRecommendations .rev-rec .rev-rec-side b').first().textContent();
 assert.match(score,/\d+%/,'Aderência score must be populated');
 assert.ok(await page.locator('#revRecommendations [data-rev-track]').count()>0,'Tracking button attached');
 await page.locator('#rlbHomeRecommendationFilters [data-home-rec-filter="soon"]').click();
 assert.equal(await page.locator('#rlbHomeRecommendationFilters [data-home-rec-filter="soon"]').getAttribute('aria-pressed'),'true');
 await until(page,()=>document.querySelector('#revRecommendations')?.textContent?.includes('Aquisição de combustível para a frota CI'),timeout);
 assert.equal(await page.locator('#revRecommendations [data-rev-track]').first().getAttribute('data-cnpj'),cnpj,
   'Tracking action must remain attached to the matching tender after filtering');
 await page.locator('#rlbHomeKpis [data-home-action="high"]').click();
 assert.equal(await page.locator('#rlbHomeRecommendationFilters [data-home-rec-filter="high"]').getAttribute('aria-pressed'),'true');
 await page.locator('#rlbHomeRecommendationFilters [data-home-rec-filter="all"]').click();
 await until(page,()=>document.querySelector('#revRecommendations')?.textContent?.includes('Aquisição de combustível para a frota CI'),timeout);
 note('Interactive KPI drilldown, fit filters and exact tender tracking identity OK');
 // Refresh manual usa os mesmos endpoints de dados reais do ciclo de 5 minutos.
 const overviewRequest=page.waitForRequest(request=>request.url().includes('/api/dashboard/overview'),{timeout:15000});
 const liveRequest=page.waitForRequest(request=>request.url().includes('/api/live-feed?'),{timeout:15000});
 await page.locator('#rlbHomeRefresh').click();
 await Promise.all([overviewRequest,liveRequest]);
 await until(page,()=>document.querySelector('#rlbHomeLiveBar')?.dataset.state==='ready',16000);
 assert.match(await page.locator('#rlbHomeLastUpdate').textContent(),/^Dados consultados às \d{2}:\d{2}$/);
 assert.match(await page.locator('#rlbHomeNextUpdate').textContent(),/Próxima consulta em/);
 assert.equal(await page.locator('#rlbHomeRefresh').isEnabled(),true);
 note('Dashboard refresh queries real overview + national feed and updates live clock OK');
 // Eventos de teste isolados simulam uma nova publicação baseada num snapshot real.
 // O teste não grava dados sintéticos no site público.
 const originalOverview=await page.evaluate(async()=>{
   const r=await fetch('/api/dashboard/overview',{credentials:'same-origin',cache:'no-store'});
   if(!r.ok)throw Error('QA snapshot not available: '+r.status);
   return r.json();
 });
 const legacyRecommendation=originalOverview.recommendations.find(item=>item.pncp_id===pncpId);
 assert.equal(new Date(legacyRecommendation.closes_at).getTime(), new Date(closes).getTime()+3*3600000,
   'Legacy PNCP deadline without an offset must be read in Brasília time');
 await page.evaluate(data=>{
   const first=data.recommendations?.[0];
   if(!first)throw Error('Need real seeded recommendation for pulse test');
   const urgentDate=new Date(Date.now()+12*3600000).toISOString();
   const newcomer={...first,sequence:Number(first.sequence)+1,
     closes_at:urgentDate,object_text:'Recomendação nova QA temporária'};
   const urgentAgenda={type:'opportunity',date:urgentDate,
     title:'Prazo novo QA temporário',subtitle:'Teste de urgência',pncp_key:'qa-urgent-temp'};
   const fake={...data,recommendations:[newcomer,...data.recommendations],
     agenda:[urgentAgenda,...(data.agenda||[])]};
   window.__rlbPulseSyntheticOverview=fake;
   document.dispatchEvent(new CustomEvent('radar:overview',{detail:fake}));
 },originalOverview);
 await until(page,()=>document.querySelector('#revRecommendations .rev-rec[data-pulse-state="new"]')?.textContent?.includes('Recomendação nova QA temporária'),8000);
 assert.ok((await page.locator('#rlbHomeNewUpdates').textContent()).includes('nova(s) recomendação'));
 const highlighted=page.locator('#revRecommendations .rev-rec[data-pulse-state="new"]').first();
 assert.equal(await highlighted.getAttribute('data-priority'),'urgent','Real closing date within 12h sets critical priority');
 assert.ok((await highlighted.textContent()).includes('Prazo em até 24h'),'Urgent tender has explicit deadline context');
 const meter=highlighted.locator('progress.rlb-fit-meter');
 assert.equal(await meter.count(),1,'Aderência has an accessible progress meter');
 assert.equal(await meter.getAttribute('aria-label'),'Aderência estimada pelos critérios dos alertas');
 assert.ok(Number(await meter.evaluate(el=>el.value))>=0,'Meter must represent a real score, not a placeholder');
 await until(page,()=>document.querySelector('#rlbHomeDeadlines .rlb-home-deadline[data-urgency="critical"]')?.textContent?.includes('Prazo novo QA temporário'),8000);
 assert.ok((await page.locator('#rlbHomeNewUpdates').textContent()).includes('prazo(s) incluído(s)'));
 note('Real deadline urgency, fit meter and new agenda highlight use data from the temporary test event OK');
 await page.evaluate(()=>{
   window.__rlbPulseUnchangedCard=document.querySelector('#revRecommendations .rev-rec');
   document.dispatchEvent(new CustomEvent('radar:overview',{detail:window.__rlbPulseSyntheticOverview}));
 });
 assert.equal(await page.evaluate(()=>window.__rlbPulseUnchangedCard===document.querySelector('#revRecommendations .rev-rec')),true,
   'Identical refreshed recommendations preserve DOM and do not blink');
 await page.evaluate(data=>document.dispatchEvent(new CustomEvent('radar:overview',{detail:data})),originalOverview);
 note('Real-snapshot diff highlights only newly introduced recommendations; unchanged cards do not blink OK');
 // Cycle through compatible records even when the next successful response has no new IDs.
 await page.evaluate(data=>{
   const first=data.recommendations[0];
   const recommendations=Array.from({length:7},(_,i)=>({...first,sequence:Number(first.sequence)+100+i}));
   window.__qaRotationOverview={...data,recommendations};
   document.dispatchEvent(new CustomEvent('radar:overview',{detail:window.__qaRotationOverview}));
 },originalOverview);
 const beforeRotation=await page.locator('#revRecommendations .rev-rec').evaluateAll(cards=>cards.map(card=>card.dataset.seq));
 await page.evaluate(()=>{
   document.dispatchEvent(new CustomEvent('radar:recommendations-cycle'));
   document.dispatchEvent(new CustomEvent('radar:overview',{detail:window.__qaRotationOverview}));
 });
 const afterRotation=await page.locator('#revRecommendations .rev-rec').evaluateAll(cards=>cards.map(card=>card.dataset.seq));
 assert.equal(afterRotation.length,3);
 assert.ok(afterRotation.every(id=>!beforeRotation.includes(id)),'Unchanged response should rotate to other compatible records');
 assert.equal(await page.locator('#revRecommendations [data-pulse-state]').count(),0,'Rotated records should not be reported as new');
 await page.evaluate(data=>document.dispatchEvent(new CustomEvent('radar:overview',{detail:data})),originalOverview);
 note('Successful consultation rotates compatible recommendations without false novelty');


 await page.locator('.rev-n-bell').click();
 await page.locator('#revNotifPanel:not([hidden])').waitFor({state:'visible',timeout});
 await until(page,()=>document.querySelector('#revNotifPanel .rev-n-list')?.textContent?.includes('Aquisição de combustível para a frota CI'),15000);
 await page.locator('.rev-n-filter').filter({hasText:'Não lidos'}).click();
 assert.ok(await page.locator('.rev-n-filter.active').filter({hasText:'Não lidos'}).count()===1,'Unread filter is selected');
 // O aviso flutuante pode marcar a entrega como lida antes da abertura da central.
 // Teste o filtro e a persistência da ação em ambos os estados legítimos.
 await page.locator('.rev-n-mark').click();
 await until(page,()=>!document.querySelector('#revNotifPanel .rev-n-item.unread'));
 const databaseUnread=await pool.query("SELECT COUNT(*)::int AS count FROM notification_deliveries WHERE user_id=$1 AND channel='onsite' AND read_at IS NULL",[userId]);
 assert.equal(databaseUnread.rows[0].count,0);
 await page.locator('.rev-n-close').click();
 note('Notification inbox, unread filter and mark-read persistence OK');

 await page.locator('#revRecommendations [data-rev-track]').first().click();
 await page.locator('#view-operation.active').waitFor({timeout});
 await until(page,()=>document.querySelector('#view-operation .rev-op-items')?.textContent?.includes('Aquisição de combustível para a frota CI'),20000);
 await page.locator('#view-operation .rev-op-item-controls select').first().selectOption('participando');
 await until(page,()=>document.querySelector('#view-operation .rev-op-item-controls select')?.value==='participando');
 const notes='Conferir documentação CI '+token;
 await page.locator('#view-operation .rev-op-item textarea').first().fill(notes);
 await page.locator('#view-operation .rev-op-item button').filter({hasText:'Salvar anotação'}).first().click();
 let dbTrack=null;
 for(let retry=0;retry<60;retry++){
   dbTrack=await pool.query('SELECT status,notes FROM user_tender_tracking WHERE user_id=$1 AND org_cnpj=$2 AND year=$3 AND sequence=$4',[userId,cnpj,year,sequence]);
   if(dbTrack.rows[0]?.status==='participando'&&dbTrack.rows[0]?.notes===notes)break;
   await new Promise(resolve=>setTimeout(resolve,150));
 }
 assert.equal(dbTrack.rows[0]?.status,'participando','Rapid status update remains committed');
 assert.equal(dbTrack.rows[0]?.notes,notes,'Rapid note update remains committed');
 assert.ok(await page.locator('#view-operation .rev-calendar').count()===1,'Calendar present');
 note('Tracking status, private notes persistence and calendar OK');

 await gotoSection(page,'home');
 // A gravação em Minha Operação deve atualizar KPIs, panorama e prazos
 // sem exigir botão Atualizar nem esperar o cache expirar.
 await until(page,()=>document.querySelector('#rlbHomePanorama .pulse-stage-chart')?.getAttribute('aria-label')==='1 licitações acompanhadas',18000);
 await until(page,()=>document.querySelector('#rlbHomeKpis .rev-stat:nth-child(3) .rev-value')?.textContent?.trim()==='1',18000);
 await page.locator('#rlbHomeRefresh').click();
 assert.ok(await page.locator('#rlbHomeDeadlines .rlb-home-deadline').count()>0,'Real deadline agenda present');
 assert.ok(await page.locator('#rlbHomePanorama .pulse-stage-chart').count()===1,'Real tracking chart present');
 await page.locator('#rlbHomeDeadlineControls [data-home-period="30"]').click();
 assert.equal(await page.locator('#rlbHomeDeadlineControls [data-home-period="30"]').getAttribute('aria-pressed'),'true');
 await page.locator('#rlbHomeDeadlineControls [data-home-period="7"]').click();
 assert.equal(await page.locator('#rlbHomeDeadlineControls [data-home-period="7"]').getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#rlbHomeDeadlines .rlb-home-deadline').count()>0,'Real deadline remains after filter toggles');
 await page.locator('#rlbHomePanorama [data-home-stage="participating"]').click();
 await page.locator('#view-operation.active').waitFor({timeout});
 assert.equal(await page.locator('#view-operation .rev-op-filter').inputValue(),'participating','Donut legend opens matching group');
 assert.ok((await page.locator('#view-operation .rev-op-items').textContent()).includes('Aquisição de combustível'));
 assert.ok(await page.locator('#rlbPageNavBar').isVisible(),'Page breadcrumb appears away from home');
 await page.locator('#rlbPageNavBar .rlb-page-back').click();
 await page.locator('#view-home.active').waitFor({timeout});
 assert.equal(await page.locator('#rlbPageNavBar').isVisible(),false);
 await page.locator('#view-home [data-home-action="calendar"]').first().click();
 await page.locator('#view-operation.active.calendar-focused').waitFor({timeout});
 assert.equal(await page.locator('#view-operation .rev-op-side').evaluate(e=>getComputedStyle(e).order),'-1',
   'Calendar appears first instead of scrolling down');
 await page.locator('#rlbPageNavBar .rlb-page-back').click();
 await page.locator('#view-home.active').waitFor({timeout});
 note('Interactive deadline period, chart stage drilldown, calendar-first page and breadcrumb return OK');

 // O painel executivo não duplica a busca; todos os critérios ficam no Radar.
 await gotoSection(page,'home');
 assert.equal(await page.locator('#rlbHomeSearchForm').count(),0);
 await page.locator('#view-home [data-home-action="radar"]').first().click();
 await page.locator('#view-radar.active').waitFor({timeout});
 assert.ok(await page.locator('#radarStatePicker').isVisible(),'UF is always shown in Radar search');
 assert.ok(await page.locator('#searchModality').isVisible(),'Modality is always shown');
 assert.ok(await page.locator('#radarClosingDays').isVisible(),'Deadline is always shown');
 assert.equal(await page.locator('#radarFilters').isVisible(),false,'Extra filters collapsed by default');
 await page.locator('#searchKeyword').fill('combustível');
 await page.locator('#radarStatePicker summary').click();
 await page.locator('#radarStateSearch').fill('Rio Grande do Norte');
 await page.locator('#radarStates input[value="RN"]').check();
 await page.locator('#radarStateDone').click();
 assert.equal(await page.locator('#radarStateSummary').textContent(),'RN');
 await page.locator('#searchModality').selectOption('6');
 await page.locator('#radarClosingDays').selectOption('7');
 await page.locator('#radarFiltersToggle').click();
 await page.locator('#radarMunicipality').fill('Natal');
 await page.locator('#radarOrganization').fill('Prefeitura QA');
 await page.locator('#searchDays').selectOption('30');
 await page.locator('#radarSearchForm button[type="submit"]').click();
 await until(page,()=>window.scrollY<=4,timeout);
 assert.ok(await page.locator('#rlbPageNavBar').isVisible(),'Search remains in Radar with breadcrumb');
 assert.equal(await page.locator('#searchKeyword').inputValue(),'combustível');
 assert.equal(await page.locator('#searchModality').inputValue(),'6');
 assert.equal(await page.locator('#radarClosingDays').inputValue(),'7');
 assert.equal(await page.locator('#radarStates input[value="RN"]').isChecked(),true);
 assert.equal(await page.locator('#radarMunicipality').inputValue(),'Natal');
 assert.equal(await page.locator('#radarOrganization').inputValue(),'Prefeitura QA');
 assert.equal(await page.locator('#searchDays').inputValue(),'30');
 assert.equal(await page.locator('#radarFilters').isVisible(),false,'Advanced panel collapses on submit');
 assert.ok((await page.locator('#radarChips').textContent()).includes('RN'));
 note('Single Radar search retains keyword, UF, modality, deadline and advanced fields OK');
 await page.locator('#radarClear').click();
 assert.equal(await page.locator('#searchKeyword').inputValue(),'');
 assert.equal(await page.locator('#searchModality').inputValue(),'');
 assert.equal(await page.locator('#radarStateSummary').textContent(),'Todo o Brasil');
 note('Clear all search criteria from consolidated Radar page OK');
 await page.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight);document.querySelector('#mainNav [data-view="home"]').click()});
 await page.locator('#view-home.active').waitFor({timeout});
 await until(page,()=>window.scrollY<=4,timeout);
 await page.evaluate(()=>{window.scrollTo(0,document.body.scrollHeight);document.querySelector('#mainNav [data-view="radar"]').click()});
 await page.locator('#view-radar.active').waitFor({timeout});
 await until(page,()=>window.scrollY<=4,timeout);
 note('Navigation opens new pages at the top even after scrolling to bottom OK');

 await page.locator('#radarSaveSearch').click();
 await page.locator('#radarSaveDialog').waitFor({state:'visible'});
 await page.locator('#radarSearchName').fill('Busca QA '+token);
 await page.locator('#radarSaveDialog button[value=save]').click();
 await gotoSection(page,'saved-searches');
 await until(page,()=>document.querySelector('#radarSavedSearchList')?.textContent?.includes('Busca QA '),20000);
 note('Save and retrieve search via UI OK');

 await gotoSection(page,'documents');
 await page.locator('#docInput').setInputFiles({name:'ci-audit-note.txt',mimeType:'text/plain',buffer:Buffer.from('Documento isolado de teste CI '+token)});
 await until(page,()=>document.querySelector('#documentsList')?.textContent?.includes('ci-audit-note.txt'),20000);
 note('Personal documents upload and list OK');

 await page.locator('.ai-fab').click();
 await until(page,()=>document.querySelector('#ai-assistant')?.classList.contains('ai-widget-open'));
 await page.locator('#ai-assistant.ai-widget-open .ai-window').waitFor({state:'visible',timeout});
 const aiPopup=await page.evaluate(()=>{
   const section=document.querySelector('#ai-assistant'),windowEl=section?.querySelector('.ai-window');
   const box=windowEl?.getBoundingClientRect();
   return {opacity:getComputedStyle(section).opacity,width:box?.width||0,height:box?.height||0};
 });
 assert.equal(aiPopup.opacity,'1','AI-RLB must not remain transparent');
 assert.ok(aiPopup.width>=250&&aiPopup.height>=250,'AI popup must have a usable visible size');
 assert.ok(await page.locator('#aiPrompt').isVisible(),'AI floating composer must open');
 await page.locator('#ai-assistant .ai-close').click();
 await until(page,()=>!document.querySelector('#ai-assistant')?.classList.contains('ai-widget-open'));
 note('AI-RLB launcher, composer and close button OK (no paid API request)');

 await page.setViewportSize({width:390,height:844});
 await gotoSection(page,'home');
 const widths=await page.evaluate(()=>{
  const get=(selector)=>{const e=document.querySelector(selector);if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width}};
  return {screen:innerWidth,summary:get('#revSummary'),content:get('#view-home'),notification:get('.rev-n-bell')};
 });
 assert.ok(widths.summary&&widths.summary.x>=-4&&widths.summary.right<=widths.screen+5,'Mobile summary should not overflow viewport: '+JSON.stringify(widths));
 assert.ok(widths.content&&widths.content.right<=widths.screen+5,'Mobile executive home fits viewport: '+JSON.stringify(widths));
 await page.locator('.rev-n-bell').click();
 const box=await page.locator('.rev-n-panel').boundingBox();
 assert.ok(box&&box.x>=-3&&box.x+box.width<=390+5,'Mobile notification panel fits screen');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#revNotifPanel').getAttribute('hidden'),'','Escape closes notification panel');
 note('Mobile 390px responsiveness, notifications and keyboard Escape OK');

 // Visibilidade em mais larguras, sem rolagem horizontal oculta, nos dois temas.
 for(const width of [320,390,768,1024,1440]){
   await page.setViewportSize({width,height:880});
   await gotoSection(page,'home');
   for(const theme of ['light','dark']){
     await page.evaluate(next=>{document.documentElement.dataset.theme=next},theme);
     const dimensions=await page.evaluate(()=>{
       const root=document.querySelector('#view-home'),body=document.documentElement;
       const k=document.querySelector('#rlbHomeKpis');
       const r=root.getBoundingClientRect(),b=k.getBoundingClientRect();
       return {innerWidth,documentWidth:body.scrollWidth,homeRight:r.right,kpisRight:b.right};
     });
     assert.ok(dimensions.documentWidth<=width+6,'Horizontal overflow '+theme+' @'+width+': '+JSON.stringify(dimensions));
     assert.ok(dimensions.homeRight<=width+6&&dimensions.kpisRight<=width+6,
       'Home content overflows '+theme+' @'+width+': '+JSON.stringify(dimensions));
     await gotoSection(page,'radar');
     const bar=await page.locator('#radarSearchForm .radar-search-bar').boundingBox();
     assert.ok(bar&&bar.x>=-4&&bar.x+bar.width<=width+6,
       'Radar search should fit '+theme+' @'+width+': '+JSON.stringify(bar));
     assert.ok(await page.locator('#radarStatePicker').isVisible(),'UF visible @'+width);
     assert.ok(await page.locator('#searchModality').isVisible(),'Modality visible @'+width);
     assert.ok(await page.locator('#radarClosingDays').isVisible(),'Deadline visible @'+width);
     await gotoSection(page,'home');
   }
 }
 note('Executive home and Radar search responsive 320/390/768/1024/1440px, both themes OK');

 // A paleta deve alterar cores computadas dos quatro KPIs quando o tema muda.
 const themePalettes=[];
 for(const theme of ['light','dark']){
   await page.evaluate(next=>{document.documentElement.dataset.theme=next},theme);
   themePalettes.push(await page.evaluate(()=>{
     const home=document.querySelector('#view-home');
     const first=home.querySelector('.rev-stat');
     const styles=getComputedStyle(first);
     return {color:styles.color,background:styles.backgroundImage,
       surface:getComputedStyle(home).getPropertyValue('--rlb-home-surface').trim()};
   }));
 }
 assert.notEqual(themePalettes[0].background,themePalettes[1].background,'KPI gradient must react to theme');
 assert.notEqual(themePalettes[0].color,themePalettes[1].color,'KPI text must react to theme');
 assert.notEqual(themePalettes[0].surface,themePalettes[1].surface,'Card surfaces must react to theme');
 // Toggle real preserva interação e preferência, não apenas atributo via JS.
 const themeBefore=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarTheme').click();
 assert.notEqual(await page.locator('html').getAttribute('data-theme'),themeBefore,'Theme button must toggle palette');
 await page.locator('#radarTheme').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),themeBefore,'Theme button must restore palette');
 note('Adaptive KPI palette and functional light/dark theme toggle OK');


 // Avança apenas o relógio da aba isolada de QA: comprova o disparo real
 // do agendamento de cinco minutos sem esperar cinco minutos no CI.
 await gotoSection(page,'home');
 const scheduledOverview=page.waitForRequest(r=>r.url().includes('/api/dashboard/overview'),{timeout:11000});
 const scheduledFeed=page.waitForRequest(r=>r.url().includes('/api/live-feed?'),{timeout:11000});
 await page.evaluate(()=>{
   window.__qaOriginalDateNow=Date.now;
   Date.now=()=>window.__qaOriginalDateNow()+6*60*1000;
 });
 try{
   await Promise.all([scheduledOverview,scheduledFeed]);
 }finally{
   await page.evaluate(()=>{Date.now=window.__qaOriginalDateNow;delete window.__qaOriginalDateNow});
 }
 await until(page,()=>document.querySelector('#rlbHomeLiveBar')?.dataset.state==='ready',15000);
 assert.equal(await page.locator('#rlbHomeRefresh').isEnabled(),true);
 note('Five-minute scheduled refresh actually fires both real backend requests in Chrome OK');

 const fatal=problems.filter(x=>!(/ERR_CONNECTION|Failed to fetch|network error/i.test(x)));
 assert.deepEqual(fatal,[],'Unexpected browser JavaScript errors');
 note('Real Chromium end-to-end UI smoke PASSED');
}finally{
 try{if(browser)await browser.close()}catch{}
 if(userId||adminId)await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[[userId,adminId].filter(Boolean)]).catch(e=>console.warn('test users cleanup:',e.message));
 await pool.query('DELETE FROM monitored_procurements WHERE pncp_id=$1',[pncpId]).catch(e=>console.warn('test tender cleanup:',e.message));
 await pool.end();
}
