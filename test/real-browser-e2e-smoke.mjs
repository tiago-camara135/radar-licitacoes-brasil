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
 assert.ok(await page.locator('#rlbHomeSearchForm').isVisible());
 assert.ok(await page.locator('#rlbHomeRecent').count()===1);
 note('Executive home layout and real KPI cards OK');
 assert.equal(await page.locator('#adminNav').isVisible(),false,'Non-admin cannot see admin navigation');
 const inTheme=await page.locator('html').getAttribute('data-theme');
 await page.locator('#radarTheme').click();
 const changed=await page.locator('html').getAttribute('data-theme');
 assert.notEqual(inTheme,changed,'Authenticated theme control works');
 note('Registration, authenticated dashboard, four metrics, user role and theme OK');

 // O navegador valida duas contas efêmeras, sem alterar papéis de uma
 // sessão já ativa. O usuário comum continua autenticado na aba principal.
 const adminCtx=await browser.newContext({viewport:{width:1366,height:850},locale:'pt-BR',timezoneId:'America/Fortaleza'});
 const adminPage=await adminCtx.newPage();
 adminPage.on('pageerror',e=>problems.push('admin: '+e.message));
 adminId=await register(adminPage,adminEmail);
 await pool.query("UPDATE users SET role='admin' WHERE id=$1",[adminId]);
 const adminReload=await adminPage.reload({waitUntil:'domcontentloaded'});
 assert.equal(adminReload.status(),200,'Admin page reload must succeed');
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
 const raw={numeroControlePNCP:pncpId,anoCompra:year,sequencialCompra:sequence,modalidadeId:6,modalidadeNome:'Pregão - Eletrônico',objetoCompra:object,orgaoEntidade:{cnpj,razaoSocial:'Prefeitura QA'},unidadeOrgao:{municipioNome:'Natal',ufSigla:'RN'},dataPublicacaoPncp:new Date().toISOString(),dataEncerramentoProposta:closes,valorTotalEstimado:140000};
 await pool.query("INSERT INTO monitored_procurements(pncp_id,org_cnpj,year,sequence,modality_code,modality_name,object_text,org_name,municipality,uf,estimated_value,published_at,closes_at,pncp_url,raw,detected_at,last_seen_at) VALUES($1,$2,$3,$4,6,'Pregão - Eletrônico',$5,'Prefeitura QA','Natal','RN',140000,NOW(),$6,$7,$8::jsonb,NOW(),NOW())",[pncpId,cnpj,year,sequence,object,closes,'https://pncp.gov.br/app/editais/'+cnpj+'/'+year+'/'+sequence,JSON.stringify(raw)]);
 const notificationPayload={object,org:'Prefeitura QA',municipality:'Natal',uf:'RN',pncp_url:'https://pncp.gov.br/app/editais/'+cnpj+'/'+year+'/'+sequence};
 await pool.query("INSERT INTO notification_deliveries(user_id,alert_id,pncp_id,channel,status,payload,created_at,sent_at) VALUES($1,$2,$3,'onsite','sent',$4::jsonb,NOW(),NOW())",[userId,alertId,pncpId,JSON.stringify(notificationPayload)]);

 await gotoSection(page,'home');
 await page.evaluate(item=>document.dispatchEvent(new CustomEvent('radar:live-feed',{detail:{items:[item]}})),raw);
 await until(page,()=>document.querySelector('#rlbHomeRecent')?.textContent?.includes('Aquisição de combustível para a frota CI'),10000);
 const recentHref=await page.locator('#rlbHomeRecent a.rlb-home-table-open').first().getAttribute('href');
 assert.ok(recentHref?.startsWith('https://pncp.gov.br/app/editais/'),'Recent item links to official PNCP');
 await page.locator('#revSummary .rev-action').first().click();
 await until(page,()=>document.querySelector('#revRecommendations')?.textContent?.includes('Aquisição de combustível para a frota CI'),25000).catch(()=>{throw Error('Recommendations did not render the seeded matching tender')});
 await page.locator('#revRecommendations .rev-rec').first().waitFor({timeout});
 const score=await page.locator('#revRecommendations .rev-rec .rev-rec-side b').first().textContent();
 assert.match(score,/\d+%/,'Aderência score must be populated');
 assert.ok(await page.locator('#revRecommendations [data-rev-track]').count()>0,'Tracking button attached');
 note('Personalized recommendations, score and tracking action OK');

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
 await page.locator('#revSummary .rev-action').first().click();
 await until(page,()=>document.querySelector('#rlbHomePanorama .rlb-home-ring-center strong')?.textContent?.trim()==='1',18000);
 assert.ok(await page.locator('#rlbHomeDeadlines .rlb-home-deadline').count()>0,'Real deadline agenda present');
 assert.ok(await page.locator('#rlbHomePanorama .rlb-home-ring').count()===1,'Real tracking chart present');
 note('Executive home agenda and operation donut chart use persisted account data OK');

 await page.locator('#rlbHomeKeyword').fill('combustível');
 await page.locator('#rlbHomeUf').selectOption('RN');
 await page.locator('#rlbHomeModality').selectOption('6');
 await page.locator('#rlbHomeClosingDays').selectOption('7');
 await page.locator('#rlbHomeSearchForm [type="submit"]').click();
 await page.locator('#view-radar.active').waitFor({timeout});
 assert.equal(await page.locator('#searchKeyword').inputValue(),'combustível');
 assert.equal(await page.locator('#searchModality').inputValue(),'6');
 assert.equal(await page.locator('#radarClosingDays').inputValue(),'7');
 assert.equal(await page.locator('#radarStates input[value="RN"]').isChecked(),true);
 note('Executive search transfers keyword, UF, modality and deadline filters to full Radar OK');

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
  return {screen:innerWidth,summary:get('#revSummary'),search:get('#rlbHomeSearchForm'),content:get('#view-home'),notification:get('.rev-n-bell')};
 });
 assert.ok(widths.summary&&widths.summary.x>=-4&&widths.summary.right<=widths.screen+5,'Mobile summary should not overflow viewport: '+JSON.stringify(widths));
 assert.ok(widths.search&&widths.search.x>=-4&&widths.search.right<=widths.screen+5,'Mobile search fits viewport: '+JSON.stringify(widths));
 assert.ok(widths.content&&widths.content.right<=widths.screen+5,'Mobile executive home fits viewport: '+JSON.stringify(widths));
 await page.locator('.rev-n-bell').click();
 const box=await page.locator('.rev-n-panel').boundingBox();
 assert.ok(box&&box.x>=-3&&box.x+box.width<=390+5,'Mobile notification panel fits screen');
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#revNotifPanel').getAttribute('hidden'),'','Escape closes notification panel');
 note('Mobile 390px responsiveness, notifications and keyboard Escape OK');

 const fatal=problems.filter(x=>!(/ERR_CONNECTION|Failed to fetch|network error/i.test(x)));
 assert.deepEqual(fatal,[],'Unexpected browser JavaScript errors');
 note('Real Chromium end-to-end UI smoke PASSED');
}finally{
 try{if(browser)await browser.close()}catch{}
 if(userId||adminId)await pool.query('DELETE FROM users WHERE id=ANY($1::bigint[])',[[userId,adminId].filter(Boolean)]).catch(e=>console.warn('test users cleanup:',e.message));
 await pool.query('DELETE FROM monitored_procurements WHERE pncp_id=$1',[pncpId]).catch(e=>console.warn('test tender cleanup:',e.message));
 await pool.end();
}
