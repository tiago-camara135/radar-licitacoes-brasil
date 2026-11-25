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
 page.setDefaultTimeout(timeout);page.setDefaultNavigationTimeout(timeout);
 page.on('pageerror',e=>problems.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#authScreen:not(.hidden)').waitFor({state:'visible'});
 const before=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarPublicTheme').click();
 await until(page,previous=>document.documentElement.dataset.theme!==previous,6000).catch(async()=>{const after=await page.locator('html').getAttribute('data-theme');assert.notEqual(after,before,'Public theme toggle must work')});
 const publicAfter=await page.locator('html').getAttribute('data-theme');
 assert.notEqual(publicAfter,before,'Public theme toggle works');
 note('Public login page and theme switch OK');
 // New selector is real, persistent, and tracks the system only in Auto.
 const publicAppearance=page.locator('#authScreen .pulse-appearance');
 await publicAppearance.locator('[data-pulse-theme="light"]').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await publicAppearance.locator('[data-pulse-theme="dark"]').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 await page.emulateMedia({colorScheme:'light'});
 await publicAppearance.locator('[data-pulse-theme="auto"]').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 await page.emulateMedia({colorScheme:'dark'});
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
 assert.equal(await page.evaluate(()=>localStorage.getItem('rlb-theme-v2')),'auto');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.dataset.themePreference==='auto');
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
 assert.equal(await publicAppearance.locator('[data-pulse-theme="auto"]').getAttribute('aria-pressed'),'true');
 await publicAppearance.locator('[data-pulse-theme="light"]').click();
 note('Pulse 2.0 appearance selector: light/dark/auto, system changes and reload persistence OK');
 // Test actual browser-computed foreground/background pairs; ignore no painted backgrounds.
 async function assertLightContrast(target,background,label){
   const pair=await page.evaluate(({target,background})=>{
     const a=document.querySelector(target),b=document.querySelector(background);
     if(!a||!b)throw new Error('Missing contrast target: '+target+' / '+background);
     return {fg:getComputedStyle(a).color,bg:getComputedStyle(b).backgroundColor};
   },{target,background});
   const luminance=v=>{const values=v.match(/[0-9.]+/g).slice(0,3).map(Number).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*values[0]+.7152*values[1]+.0722*values[2]};
   const a=luminance(pair.fg),b=luminance(pair.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
   assert.ok(ratio>=4.5,label+' contrast '+ratio.toFixed(2)+' '+JSON.stringify(pair));
 }

 await assertLightContrast('.auth-home-capability-stats strong','.auth-home-capability-stats>div','Public capability KPI');
 for(const [tab,selector] of [['radar','.demo-results b'],['alerts','.demo-alert-builder b'],['ai','.demo-ai-msg b'],['support','.demo-support-grid b']]){
   await page.locator('.auth-home-demo-tabs [data-demo="'+tab+'"]').click();
   await page.locator(selector).first().waitFor({state:'visible',timeout});
   await assertLightContrast(selector,'.auth-home-demo-panel','Public '+tab+' demo');
 }
 await page.locator('.auth-home-demo-tabs [data-demo="radar"]').click();
 note('Arctic Pro: public KPI and all four demonstration tabs contrast OK');

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
 await page.locator('#radarAccount summary').click();
 await page.locator('#radarTheme').click();
 await page.keyboard.press('Escape');
 const changed=await page.locator('html').getAttribute('data-theme');
 assert.notEqual(inTheme,changed,'Authenticated theme control works');
 note('Registration, authenticated dashboard, four metrics, user role and theme OK');
 await page.locator('#radarAccount summary').click();
 const internalAppearance=page.locator('#radarAccount .pulse-appearance');
 await internalAppearance.locator('[data-pulse-theme="light"]').click();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
 assert.equal(await internalAppearance.locator('[data-pulse-theme="light"]').getAttribute('aria-pressed'),'true');
 await page.keyboard.press('Escape');
 note('Pulse 2.0 authenticated appearance controls OK');

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
 for(let n=1;n<=4;n++)await pool.query("INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,created_at,sent_at) VALUES($1,$2,$3,'onsite','sent',$4::jsonb,NOW(),NOW())",[userId,alertId,pncpId+'-digest-'+n,JSON.stringify({...notificationPayload,object:'Outro alerta QA '+n})]);
 await pool.query("INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,created_at,sent_at) VALUES($1,$2,$3,'onsite','sent',$4::jsonb,NOW()-INTERVAL '1 day',NOW()-INTERVAL '1 day')",[userId,alertId,pncpId+'-old',JSON.stringify({...notificationPayload,object:'Histórico antigo QA'})]);
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
 // Validate the exact empty-account scenario from the home dashboard.
 await pool.query('UPDATE saved_alerts SET enabled=false WHERE id=$1 AND user_id=$2',[alertId,userId]);
 const publicSnapshot=await page.evaluate(async()=>{const r=await fetch('/api/dashboard/overview');if(!r.ok)throw Error('Preview HTTP '+r.status);const data=await r.json();document.dispatchEvent(new CustomEvent('radar:overview',{detail:data}));return data});
 assert.equal(publicSnapshot.recommendations.length,0);
 assert.ok(publicSnapshot.national_preview.opportunities.some(x=>x.pncp_id===pncpId));
 await page.locator('#revRecommendations .rev-rec[data-source="national"]').first().waitFor({state:'visible',timeout});
 assert.equal(await page.locator('#revRecommendations .rlb-fit-meter').count(),0,'General preview cannot show fabricated adherence');
 assert.match(await page.locator('#rlbHomeDeadlines').textContent(),/Prazos do Radar/);
 assert.equal(await page.locator('#rlbHomePanorama .pulse-stage-chart').count(),0,'General preview must not fabricate tracking');
 await pool.query('UPDATE saved_alerts SET enabled=true WHERE id=$1 AND user_id=$2',[alertId,userId]);
 await page.evaluate(async()=>{const r=await fetch('/api/dashboard/overview');if(!r.ok)throw Error('Personal overview HTTP '+r.status);document.dispatchEvent(new CustomEvent('radar:overview',{detail:await r.json()}))});
 await page.locator('#revRecommendations .rev-rec:not([data-source]) .rlb-fit-meter').first().waitFor({state:'visible',timeout});
 note('Unconfigured home shows genuine general opportunities and deadlines, then personal recommendations after alert activation OK');
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


 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('radar:notifications-refresh')));
 await page.locator('#rlbNationalNoticeHost .rp-notice').first().waitFor({state:'visible',timeout});
 const balloon=page.locator('#rlbNationalNoticeHost .rp-notice').first();
 assert.match(await balloon.textContent(),/5 novos alertas para sua conta/);
 const stillUnread=await pool.query("SELECT COUNT(*)::int AS count FROM notification_deliveries WHERE user_id=$1 AND channel='onsite' AND read_at IS NULL",[userId]);
 assert.ok(stillUnread.rows[0].count>0,'Displaying a toast must not mark it as read');
 const cursorTest=await page.evaluate(async()=>{const r=await fetch('/api/stability/notifications/onsite?limit=1');const d=await r.json();const id=d.items[0].id;const next=await fetch('/api/stability/notifications/onsite?limit=1&after='+encodeURIComponent(id));return {first:id,next:(await next.json()).items}});assert.ok(cursorTest.first);assert.ok(cursorTest.next.every(x=>BigInt(x.id)>BigInt(cursorTest.first)),'Onsite cursor cannot repeat the same unread record');
 await balloon.hover();
 await page.waitForTimeout(350);
 assert.equal(await balloon.isVisible(),true);
 await balloon.locator('.radar-notice-close').click();
 assert.equal(await balloon.count(),0);
 await pool.query("INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,created_at,sent_at) VALUES($1,$2,$3,'onsite','sent',$4::jsonb,NOW(),NOW())",[userId,alertId,pncpId+'-after',JSON.stringify({...notificationPayload,object:'Novo alerta durante intervalo QA'})]);
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('radar:notifications-refresh')));
 await page.waitForTimeout(1500);
 assert.equal(await balloon.count(),0,'Closing a digest or receiving another alert cannot start a toast chain');
 const digestStored=await page.evaluate(id=>JSON.parse(localStorage.getItem('rlb-popup-digest-v1:'+id)||'null'),String(userId));
 assert.ok(digestStored?.lastPopupAt&&digestStored?.afterId,'Per-account popup budget persisted');
 note('Personalized Pulse consolidated notification excludes old history, preserves unread state and prevents rapid replay OK');
 note('Notification inbox: opening');
 await page.locator('.rev-n-bell').click({timeout});
 await page.locator('#revNotifPanel:not([hidden])').waitFor({state:'visible',timeout});
 await until(page,()=>document.querySelector('#revNotifPanel .rev-n-list')?.textContent?.includes('Aquisição de combustível para a frota CI'),15000);
 note('Notification inbox: deliveries rendered');
 await page.locator('.rev-n-filter').filter({hasText:'Urgentes'}).click({timeout});
 assert.equal(await page.locator('.rev-n-filter.active').textContent(),'Urgentes');
 await page.locator('.rev-n-filter').filter({hasText:'Não lidos'}).click({timeout});
 assert.ok(await page.locator('.rev-n-filter.active').filter({hasText:'Não lidos'}).count()===1,'Unread filter is selected');
 // O aviso flutuante pode marcar a entrega como lida antes da abertura da central.
 // Teste o filtro e a persistência da ação em ambos os estados legítimos.
 note('Notification inbox: marking all via real HTTP');
 const [marked]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/notifications/read-all')&&r.request().method()==='POST',{timeout}),page.locator('.rev-n-mark').click({timeout})]);
 assert.equal(marked.status(),200,'Mark all HTTP '+marked.status());
 note('Notification inbox: mark-all HTTP 200');
 await until(page,()=>!document.querySelector('#revNotifPanel .rev-n-item.unread'));
 const databaseUnread=await pool.query({text:"SELECT COUNT(*)::int AS count FROM notification_deliveries WHERE user_id=$1 AND channel='onsite' AND read_at IS NULL",values:[userId],query_timeout:8000});
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
 await page.locator('[data-operation-mode="board"]').click();
 await page.locator('.rp-kanban-column[data-stage="participando"] .rev-op-item').first().waitFor({timeout});
 const boardCard=page.locator('.rp-kanban-column[data-stage="participando"] .rev-op-item').first();
 assert.match(await boardCard.textContent(),/Aquisição de combustível/);
 await boardCard.locator('select').selectOption('recurso');
 await page.locator('.rp-kanban-column[data-stage="recurso"] .rev-op-item').first().waitFor({timeout});
 await page.locator('.rp-kanban-column[data-stage="recurso"] .rev-op-item select').first().selectOption('participando');
 await page.locator('.rp-kanban-column[data-stage="participando"] .rev-op-item').first().waitFor({timeout});
 await page.locator('[data-operation-mode="list"]').click();
 note('CRM Kanban uses private tracking data and persists stage movement OK');

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
 await page.evaluate(()=>{document.documentElement.dataset.theme='light'});
 await page.waitForTimeout(250);
 await assertLightContrast('#ai-assistant .ai-window-head b','#ai-assistant .ai-window-head','AI header');
 await assertLightContrast('#aiStatusText','#ai-assistant .ai-window-head','AI status');
 await assertLightContrast('#ai-assistant .ai-close','#ai-assistant .ai-close','AI close control');
 note('Arctic Pro: AI-RLB header and controls contrast OK');
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
 await assertLightContrast('#radarMenuToggle','#radarMenuToggle','Mobile menu control');
 await assertLightContrast('#mainNav button.active','#mainNav button.active','Active mobile navigation');
 note('Arctic Pro: mobile navigation contrast OK');
 await page.setViewportSize({width:1440,height:900});
 await gotoSection(page,'home');
 await page.locator('#pulseRailToggle').click();
 const expandedRail=await page.locator('#mainNav').boundingBox(),expandedHome=await page.locator('#view-home').boundingBox();
 assert.ok(expandedRail.width>=204&&expandedRail.x+expandedRail.width<=expandedHome.x,'Expanded rail must not overlap content');
 assert.equal(await page.locator('#pulseRailToggle').getAttribute('aria-expanded'),'true');
 await page.locator('#pulseRailToggle').click();
 assert.equal(await page.locator('#pulseRailToggle').getAttribute('aria-expanded'),'false');
 note('Pulse 3.0 expanded and compact navigation work without overlap');
 await page.keyboard.press('Control+k');
 await page.locator('.pb-dialog[open]').waitFor({timeout});
 await page.locator('.pb-dialog input[type="search"]').fill('Inteligência');
 await page.locator('.pb-dialog .pb-choice').filter({hasText:/^Inteligência$/}).click();
 await page.locator('#view-intelligence.active').waitFor({timeout});
 // Automatic load on entering the intelligence view.
 await page.locator('#pbNationalResults .pb-metrics').waitFor({timeout});
 const [drill]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/dashboard/intelligence?')&&r.url().includes('kind=due7'),{timeout}),page.locator('#pbNationalResults [data-kind="due7"]').click()]);assert.equal(drill.status(),200);
 await page.locator('#pbNationalResults [data-kind="due7"][aria-pressed="true"]').waitFor({timeout});
 await page.locator('[data-pb-tab="contracts"]').click();
 assert.ok(await page.locator('#pbContractForm').isVisible(),'Contract form accessible; no external requests in CI');
 // Deterministic network fixture: exercises rendering, recovery, deduplication and export
 // without contacting PNCP or adding synthetic records to production.
 const contractFixture={id:'fixture-1',object:'=1+1 QA contrato',org:'Órgão QA',uf:'RN',supplier_name:'Fornecedor QA',supplier:'12345678000195',value:100,published:'2026-01-01',end:'2027-01-01',url:'https://pncp.gov.br/app/contratos/12345678000195/2026/1'};
 let failNext=true;
 await page.route('**/api/dashboard/contracts?*',async route=>{
   const p=Number(new URL(route.request().url()).searchParams.get('page'));
   if(p===2&&failNext){failNext=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'PNCP temporariamente indisponível'})});return}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:p===1?[contractFixture]:[contractFixture,{...contractFixture,id:'fixture-2',object:'Segundo contrato QA',value:200}],coverage:{page:p,pages:[p],last_page:p,next_page:p+1,total_pages:2,failed_pages:[]},source:'Amostra de teste; cobertura parcial.'})});
 });
 await page.locator('#pbContractForm button[type="submit"]').click();
 await page.locator('#pbContractResults .pb-contract').first().waitFor({timeout});
 assert.equal(await page.locator('#pbContractResults .pb-contract').count(),1);
 await page.locator('#pbNext').click();
 await until(page,()=>document.querySelector('#pbContractStatus')?.textContent.includes('resultados anteriores preservados'));
 assert.equal(await page.locator('#pbContractResults .pb-contract').count(),1);
 await page.locator('#pbNext').click();
 await until(page,()=>document.querySelectorAll('#pbContractResults .pb-contract').length===2);
 assert.ok(await page.locator('#pbNext').isDisabled());
 const [csv]=await Promise.all([page.waitForEvent('download',{timeout}),page.locator('#pbExport').click()]);
 assert.equal(csv.suggestedFilename(),'radar-contratos-resultados-parciais.csv');
 const csvStream=await csv.createReadStream();let csvText='';for await(const part of csvStream)csvText+=part.toString();
 assert.ok(csvText.includes("'=1+1 QA contrato"),'CSV formula injection guard');
 assert.ok(csvText.includes('Segundo contrato QA'));
 assert.equal((csvText.match(/fixture-1/g)||[]).length,1,'CSV must deduplicate');
 await page.unroute('**/api/dashboard/contracts?*');
 // Real UI sends a bounded first lot for a long interval and exposes a separate ata filter.
 const lots=[];await page.route('**/api/dashboard/contracts?*',async route=>{const p=new URL(route.request().url()).searchParams;lots.push(Object.fromEntries(p));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{...contractFixture,id:'lot-'+lots.length,kind:p.get('kind'),validity:'expired',begin:'2024-01-01',end:'2024-12-31'}],coverage:{page:1,last_page:1,next_page:2,total_pages:1},source:'Fixture isolada'}})});
 await page.locator('#pbContractForm input[name="start"]').fill('2024-01-01');await page.locator('#pbContractForm input[name="end"]').fill('2024-03-31');
 await page.locator('#pbContractForm select[name="validity"]').selectOption('expired');
 await page.locator('#pbContractForm button[type="submit"]').click();await page.locator('#pbContractResults .pb-contract').first().waitFor({timeout});
 assert.equal(lots[0].validity,'expired');assert.equal(lots[0].end,'2024-03-31');assert.equal(lots[0].start,'2024-03-01');
 await page.locator('#pbNext').click();await until(page,()=>document.querySelectorAll('#pbContractResults .pb-contract').length===2);
 assert.equal(lots[1].end,'2024-02-29');
 await page.locator('#pbContractForm select[name="kind"]').selectOption('ata');assert.ok(!(await page.locator('#pbContractForm input[name="supplier"]').isVisible()));await page.locator('#pbContractForm button[type="submit"]').click();await until(page,()=>document.querySelector('#pbContractResults .pb-contract')?.textContent.includes('Prazo encerrado'));assert.equal(lots.at(-1).kind,'ata');
 await page.unroute('**/api/dashboard/contracts?*');
 note('Instrument validity filters and long publication intervals passed in Chromium');

 note('Intelligence Pro: contract UI failure recovery, retry, deduplication and safe CSV export passed with isolated network fixture');
 await page.locator('[data-pb-tab="archive"]').click();
 await page.locator('#maResults .pb-metrics').waitFor({timeout});
 await page.locator('[data-pb-tab="predict"]').click();
 await page.locator('#maTitle').filter({hasText:'Radar Predict'}).waitFor({timeout});
 await until(page,()=>document.querySelector('#maResults')?.textContent.includes('Vencem em 30 dias'));
 await page.locator('#maWatch').click();await page.locator('#maFavorites:not([hidden])').waitFor({timeout});
 note('Market Intelligence 2.0 archive, Predict and isolated favorites UI OK');
 // Each market tool has one focused panel; mocked official responses are CI-only.
 await page.route('**/api/dashboard/market/signals?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:2,due30:1,companies:new URL(route.request().url()).searchParams.get('companies')?['12345678000195']:[],competitors:[{cnpj:'12345678000195',label:'Fornecedor QA',count:2,buyers:1,value:200}],states:[{uf:'RN',count:2,value:200}],alerts:[{object:'Contrato QA',org:'Órgão QA',supplier_name:'Fornecedor QA',published:'2026-01-01',expires:'2027-01-01'}],source:'Amostra isolada de teste'})}));
 await page.locator('[data-pb-tab="compare"]').click();
 await page.locator('#pbMarketPro input[name="companies"]').fill('12345678000195');
 await page.locator('#pbMarketPro button[type="submit"]').first().click();
 await until(page,()=>document.querySelector('#pbMarketPro')?.textContent.includes('Fornecedor QA'));
 assert.ok(!(await page.locator('#pbArchive').isVisible()));
 assert.ok(!(await page.locator('#pbMarketPro .mi-lookup').isVisible()));
 await page.locator('[data-pb-tab="geo"]').click();
 await page.locator('#pbMarketPro button').filter({hasText:/^RN · 2$/}).waitFor({timeout});
 assert.ok(!(await page.locator('#pbMarketPro input[name="companies"]').isVisible()));
 await page.locator('#pbMarketPro button').filter({hasText:/^RN · 2$/}).click();
 assert.equal(await page.locator('#maForm select[name="uf"]').inputValue(),'RN');
 await page.locator('[data-pb-tab="watch"]').click();
 await page.locator('#pbMarketPro .pb-contract').first().waitFor({timeout});
 assert.ok(await page.locator('#pbMarketPro .mi-manage').isVisible());
 assert.ok(!(await page.locator('#pbMarketPro input[name="keyword"]').isVisible()));
 await page.route('**/api/dashboard/market/lookup?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({kind:'pricing',summary:{count:1,min:10,median:10,max:10},rows:[{price:10,quantity:2}],excluded:0,source:'https://pncp.gov.br/app/editais/12345678000195/2026/1',warning:'Amostra de teste'})}));
 await page.locator('[data-pb-tab="lookup"]').click();
 assert.ok(await page.locator('#pbMarketPro .mi-lookup').isVisible());
 assert.ok(!(await page.locator('#pbMarketPro input[name="keyword"]').isVisible()));
 await page.locator('#pbMarketPro select[name="kind"]').selectOption('pricing');
 await page.locator('#pbMarketPro input[name="cnpj"]').fill('12345678000195');
 await page.locator('#pbMarketPro input[name="sequence"]').fill('1');
 await page.locator('#pbMarketPro input[name="item"]').fill('1');
 assert.match(await page.locator('#pbMarketPro input[name="year"]').inputValue(),/^20\d{2}$/,'Current year must survive login form reset');
 assert.ok(await page.locator('#pbMarketPro .mi-lookup form').evaluate(f=>f.checkValidity()),'Official lookup must be valid before submit');
 const [lookupResponse]=await Promise.all([page.waitForResponse(r=>r.url().includes('/api/dashboard/market/lookup?')&&r.url().includes('kind=pricing'),{timeout}),page.locator('#pbMarketPro .mi-lookup button[type="submit"]').click()]);
 assert.equal(lookupResponse.status(),200);
 await page.locator('#pbMarketPro .mi-lookup .pb-metric').filter({hasText:'Mediana'}).waitFor({timeout});
 for(const width of [390,1280]){await page.setViewportSize({width,height:844});for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);assert.ok(await page.locator('#pbMarketPro .mi-lookup').isVisible());const size=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(size.scroll<=size.width+6,'Market layout overflow '+theme+' '+width)}}
 await page.setViewportSize({width:1280,height:800});
 await page.unroute('**/api/dashboard/market/signals?*');await page.unroute('**/api/dashboard/market/lookup?*');
 note('Market clean workspace: focused tools, regional drilldown, lookup and responsive themes passed');

 await gotoSection(page,'home');
 await page.locator('#pbCustomize').click();
 await page.locator('.pb-dialog input[type="checkbox"]').first().uncheck();
 assert.equal(await page.locator('.rlb-home-recommendations').getAttribute('data-pb-hidden'),'true');
 await page.locator('.pb-dialog .pb-choice').filter({hasText:'Restaurar padrão'}).click();
 await until(page,()=>document.querySelector('.pb-dialog')?.textContent.includes('Preferência sincronizada.'));
 await page.locator('.pb-dialog header button').click();
 assert.equal(await page.locator('.rlb-home-recommendations').getAttribute('data-pb-hidden'),'false');
 note('Pulse Business: global navigation, real national aggregation, contracts form and dashboard preference OK');

 // Visibilidade em mais larguras, sem rolagem horizontal oculta, nos dois temas.
 for(const [width,height] of [[320,700],[390,844],[768,880],[800,600],[1024,768],[1280,720],[1366,768],[1440,900],[1536,864],[1920,1080],[2560,1440],[3440,1440],[1280,550]]){
   await page.setViewportSize({width,height});
   await gotoSection(page,'home');
   if(width>=1160){
     const rail=await page.locator('#mainNav').boundingBox();
     const panel=await page.locator('#view-home').boundingBox();
     assert.ok(rail.width>=64 && rail.width<=92 && rail.x+rail.width<=panel.x);
     assert.ok(rail.y+rail.height<=height);
   }
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
 // Cover the remaining account views and short landscape viewport, without contacting external providers.
 for(const [width,height] of [[320,700],[768,600],[1280,550]]){
   await page.setViewportSize({width,height});
   for(const theme of ['light','dark']){
     await page.evaluate(next=>{document.documentElement.dataset.theme=next},theme);
     for(const view of ['saved','saved-searches','alerts','documents','operation','habilitation']){
       if(!await page.locator('#mainNav [data-view="'+view+'"]').count())continue;
       await gotoSection(page,view);
       const rect=await page.locator('#view-'+view+'.active').boundingBox();
       assert.ok(rect&&rect.x>=-5&&rect.x+rect.width<=width+6,'Module outside viewport '+view+' '+theme+' '+width+' '+JSON.stringify(rect));
     }
     await gotoSection(page,'home');
     await page.locator('#radarAccount summary').click();
     const profileBox=await page.locator('#radarAccount[open]>div').boundingBox();
     assert.ok(profileBox&&profileBox.x>=-4&&profileBox.x+profileBox.width<=width+4&&profileBox.y+profileBox.height<=height+5,'Profile menu outside viewport '+width+' '+JSON.stringify(profileBox));
     await page.keyboard.press('Escape');
     await page.locator('.rev-n-bell').click();
     const noticeBox=await page.locator('#revNotifPanel').boundingBox();
     assert.ok(noticeBox&&noticeBox.x>=-4&&noticeBox.x+noticeBox.width<=width+4&&noticeBox.y+noticeBox.height<=height+5,'Notifications outside viewport '+width+' '+JSON.stringify(noticeBox));
     await page.keyboard.press('Escape');
   }
 }
 await page.setViewportSize({width:740,height:390});
 await gotoSection(page,'home');
 await page.locator('.ai-fab').click();
 await page.locator('#ai-assistant.ai-widget-open .ai-window').waitFor({state:'visible',timeout});
 const landscape=await page.evaluate(()=>{const win=document.querySelector('#ai-assistant .ai-window'),prompt=document.querySelector('#aiPrompt'),r=win.getBoundingClientRect(),p=prompt.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,promptBottom:p.bottom,font:parseFloat(getComputedStyle(prompt).fontSize),width:innerWidth,height:innerHeight}});
 assert.ok(landscape.x>=-1&&landscape.y>=-1&&landscape.right<=landscape.width+1&&landscape.bottom<=landscape.height+1&&landscape.promptBottom<=landscape.height+1&&landscape.font>=14,'Landscape AI clipping or tiny input '+JSON.stringify(landscape));
 await page.locator('#ai-assistant .ai-close').click();
 await page.setViewportSize({width:1366,height:768});
 await gotoSection(page,'home');
 note('Pulse layout audit: account views, bounded dropdowns and landscape IA-RLB typography OK');


 // A paleta deve alterar cores computadas dos quatro KPIs quando o tema muda.
 const themePalettes=[];
 for(const theme of ['light','dark']){
   await page.evaluate(next=>{document.documentElement.dataset.theme=next},theme);
   themePalettes.push(await page.evaluate(()=>{
     const home=document.querySelector('#view-home');
     const first=home.querySelector('.rev-stat');
     const styles=getComputedStyle(first);
     return {color:styles.color,background:styles.backgroundColor,
       surface:getComputedStyle(home).getPropertyValue('--rlb-home-surface').trim()};
   }));
 }
 assert.notEqual(themePalettes[0].background,themePalettes[1].background,'KPI surface color must react to theme');
 assert.notEqual(themePalettes[0].color,themePalettes[1].color,'KPI text must react to theme');
 assert.notEqual(themePalettes[0].surface,themePalettes[1].surface,'Card surfaces must react to theme');
 // Toggle real preserva interação e preferência, não apenas atributo via JS.
 const themeBefore=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarAccount summary').click();
 await page.locator('#radarTheme').click();
 await page.keyboard.press('Escape');
 assert.notEqual(await page.locator('html').getAttribute('data-theme'),themeBefore,'Theme button must toggle palette');
 await page.locator('#radarAccount summary').click();
 await page.locator('#radarTheme').click();
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('html').getAttribute('data-theme'),themeBefore,'Theme button must restore palette');
 note('Adaptive KPI palette and functional light/dark theme toggle OK');


 // Avança apenas o relógio da aba isolada de QA: comprova o disparo real
 // do agendamento de cinco minutos sem esperar cinco minutos no CI.
 await gotoSection(page,'home');
 const scheduledOverview=page.waitForResponse(r=>r.url().includes('/api/dashboard/overview'),{timeout:16000});
 const scheduledFeed=page.waitForResponse(r=>r.url().includes('/api/live-feed?'),{timeout:16000});
 await page.evaluate(()=>{
   window.__qaOriginalDateNow=Date.now;
   Date.now=()=>window.__qaOriginalDateNow()+6*60*1000;
 });
 try{
   const [overviewResponse,feedResponse]=await Promise.all([scheduledOverview,scheduledFeed]);
   assert.equal(overviewResponse.status(),200,'Scheduled overview HTTP '+overviewResponse.status()+': '+(await overviewResponse.text()).slice(0,160));
   assert.equal(feedResponse.status(),200,'Scheduled feed HTTP '+feedResponse.status());
 }finally{
   await page.evaluate(()=>{Date.now=window.__qaOriginalDateNow;delete window.__qaOriginalDateNow});
 }
 await until(page,()=>document.querySelector('#rlbHomeLiveBar')?.dataset.state==='ready',15000).catch(async error=>{const details=await page.evaluate(()=>({state:document.querySelector('#rlbHomeLiveBar')?.dataset.state,label:document.querySelector('#rlbHomeLiveLabel')?.textContent,next:document.querySelector('#rlbHomeNextUpdate')?.textContent}));throw Error('Scheduled refresh did not settle: '+JSON.stringify(details),{cause:error})});
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
