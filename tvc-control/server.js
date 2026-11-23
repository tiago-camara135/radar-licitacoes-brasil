const express = require("express");
const path = require("path");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const crypto = require("crypto");

for (const key of ["DATABASE_URL","JWT_SECRET"]) {
  if (!process.env[key]) { console.error("Missing environment variable:",key); process.exit(1); }
}
const app = express();
const PORT = Number(process.env.PORT || 3000);
const COOKIE = "tvc_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:8,idleTimeoutMillis:30000,connectionTimeoutMillis:12000});
pool.on("error",err=>console.error("PostgreSQL pool error",err));
app.disable("x-powered-by");
app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'","data:"],connectSrc:["'self'"],fontSrc:["'self'"],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"],formAction:["'self'"]}}}));
app.use(express.json({limit:"1mb"}));
app.use(cookieParser());
app.use((req,res,next)=>{
  res.setHeader("Cache-Control","no-store");
  const origin=req.get("origin");
  if(["POST","PUT","PATCH","DELETE"].includes(req.method) && origin && origin !== req.protocol+"://"+req.get("host")) return res.status(403).json({error:"Origem não autorizada."});
  next();
});

const authLimiter = rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:"draft-7",legacyHeaders:false,message:{error:"Muitas tentativas. Aguarde alguns minutos e tente novamente."}});
const validEmail = v => typeof v==="string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length<=254;
const validDate = v => { if(typeof v!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d=new Date(v+"T12:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===v; };
const asNumber = v => Number(v||0);
const asyncRoute = fn => (req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const monthBounds = month => {
  if(!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido.");
  const d=new Date(month+"-01T12:00:00Z");
  if(Number.isNaN(d.getTime())) throw new Error("Mês inválido.");
  return [d.toISOString().slice(0,10),new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1,12)).toISOString().slice(0,10)];
};
function advanceRecurringDate(date,frequency){
  const [year,month,day]=date.split("-").map(Number);
  if(frequency==="weekly")return new Date(Date.UTC(year,month-1,day+7,12)).toISOString().slice(0,10);
  if(frequency==="monthly"){
    const monthIndex=month,nextYear=year+Math.floor(monthIndex/12),nextMonth=monthIndex%12,lastDay=new Date(Date.UTC(nextYear,nextMonth+1,0)).getUTCDate();
    return nextYear+"-"+String(nextMonth+1).padStart(2,"0")+"-"+String(Math.min(day,lastDay)).padStart(2,"0");
  }
  if(frequency==="yearly"){
    const nextYear=year+1,lastDay=new Date(Date.UTC(nextYear,month,0)).getUTCDate();
    return nextYear+"-"+String(month).padStart(2,"0")+"-"+String(Math.min(day,lastDay)).padStart(2,"0");
  }
  throw new Error("Frequência recorrente inválida.");
}
function buildRecurringForecast(rule,endExclusive){
  const amount=asNumber(rule.amount),nextDue=String(rule.next_due).slice(0,10);let due=nextDue,periodTotal=0,occurrences=0,iterations=0;
  while(due<endExclusive&&iterations<600){periodTotal+=amount;occurrences++;due=advanceRecurringDate(due,rule.frequency);iterations++;}
  return {rule_id:rule.id,account_id:rule.account_id||null,description:rule.description,amount,frequency:rule.frequency,due_on:nextDue,account_name:rule.account_name,category_name:rule.category_name||"Sem categoria",occurrences,period_total:periodTotal};
}
function recurrenceDatesInRange(rule,startInclusive,endExclusive){
  let due=String(rule.next_due).slice(0,10),iterations=0;const dates=[];
  while(due<startInclusive&&iterations<600){due=advanceRecurringDate(due,rule.frequency);iterations++;}
  while(due<endExclusive&&iterations<1200){dates.push(due);due=advanceRecurringDate(due,rule.frequency);iterations++;}
  return dates;
}
function dateDifference(from,to){const a=new Date(String(from).slice(0,10)+"T12:00:00Z"),b=new Date(String(to).slice(0,10)+"T12:00:00Z");return Math.round((b.getTime()-a.getTime())/86400000);}
const saoPauloToday=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const saoPauloMonth=()=>saoPauloToday().slice(0,7);
function setSession(res,user){
  const token=jwt.sign({sub:user.id,email:user.email,name:user.full_name},process.env.JWT_SECRET,{expiresIn:SESSION_SECONDS,issuer:"tvc-control"});
  res.cookie(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_SECONDS*1000});
}
function requireAuth(req,res,next){
  const token=req.cookies[COOKIE]||(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
  if(!token)return res.status(401).json({error:"Faça login para continuar."});
  try{
    const p=jwt.verify(token,process.env.JWT_SECRET,{issuer:"tvc-control"});
    req.user={id:p.sub,email:p.email,full_name:p.name||""};next();
  }catch{return res.status(401).json({error:"Sua sessão expirou. Entre novamente."});}
}
async function owned(table,id,userId){
  if(!id)return false;
  const r=await pool.query("SELECT id FROM "+table+" WHERE id=$1 AND user_id=$2",[id,userId]);
  return r.rowCount>0;
}
app.get("/api/health",asyncRoute(async(_req,res)=>{await pool.query("SELECT 1");res.json({ok:true,app:"TVC Control",database:"connected"});}));

app.post("/api/auth/register",authLimiter,asyncRoute(async(req,res)=>{
  const b=req.body||{},fullName=typeof b.fullName==="string"?b.fullName.trim():"",email=typeof b.email==="string"?b.email.trim().toLowerCase():"",password=b.password;
  if(fullName.length<2||fullName.length>100)return res.status(400).json({error:"Informe seu nome completo."});
  if(!validEmail(email))return res.status(400).json({error:"Informe um e-mail válido."});
  if(typeof password!=="string"||password.length<10||password.length>72)return res.status(400).json({error:"A senha deve ter entre 10 e 72 caracteres."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const hash=await bcrypt.hash(password,12);
    const created=await client.query("INSERT INTO public.profiles(email,full_name,password_hash) VALUES($1,$2,$3) RETURNING id,email,full_name",[email,fullName,hash]);
    const user=created.rows[0];
    await client.query("INSERT INTO public.accounts(user_id,name,account_type,opening_balance,color) VALUES($1,'Conta principal','checking',0,'#4169E1')",[user.id]);
    const cats=[
      ["Moradia","expense","house","#8B78D8"],["Alimentação","expense","utensils","#E4A84F"],["Transporte","expense","car","#4F9BCB"],
      ["Saúde","expense","heart-pulse","#E36E7B"],["Educação","expense","book-open","#6E9C83"],["Lazer","expense","sparkles","#C07BC5"],
      ["Serviços","expense","receipt","#6D86A8"],["Compras","expense","shopping-bag","#D58B62"],["Outros","expense","circle-ellipsis","#8792A5"],
      ["Salário","income","wallet","#2AA981"],["Renda extra","income","trending-up","#3C9CBA"],["Investimentos","income","chart","#7B8BE2"]
    ];
    for(const c of cats)await client.query("INSERT INTO public.categories(user_id,name,kind,icon,color,is_default) VALUES($1,$2,$3,$4,$5,true)",[user.id,...c]);
    await client.query("COMMIT");setSession(res,user);
    res.status(201).json({user:{id:user.id,email:user.email,fullName:user.full_name}});
  }catch(err){
    await client.query("ROLLBACK");
    if(err.code==="23505")return res.status(409).json({error:"Este e-mail já está cadastrado."});
    throw err;
  }finally{client.release();}
}));
app.post("/api/auth/login",authLimiter,asyncRoute(async(req,res)=>{
  const b=req.body||{};
  if(!validEmail(b.email)||typeof b.password!=="string")return res.status(400).json({error:"Informe e-mail e senha."});
  const r=await pool.query("SELECT id,email,full_name,password_hash FROM public.profiles WHERE lower(email)=lower($1) LIMIT 1",[b.email.trim()]);
  const u=r.rows[0];
  if(!u||!u.password_hash||!(await bcrypt.compare(b.password,u.password_hash)))return res.status(401).json({error:"E-mail ou senha incorretos."});
  await pool.query("UPDATE public.profiles SET last_login_at=now(),updated_at=now() WHERE id=$1",[u.id]);
  setSession(res,u);res.json({user:{id:u.id,email:u.email,fullName:u.full_name}});
}));
app.post("/api/auth/logout",(_req,res)=>{res.clearCookie(COOKIE,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/"});res.json({ok:true});});
app.get("/api/me",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT id,email,full_name,currency,theme FROM public.profiles WHERE id=$1",[req.user.id]);
  if(!r.rowCount)return res.status(401).json({error:"Conta não encontrada."});
  const u=r.rows[0];res.json({user:{id:u.id,email:u.email,fullName:u.full_name,currency:u.currency,theme:u.theme}});
}));
app.patch("/api/me",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{};
  if(b.fullName!==undefined&&(typeof b.fullName!=="string"||b.fullName.trim().length<2||b.fullName.trim().length>100))return res.status(400).json({error:"Nome inválido."});
  if(b.theme!==undefined&&!["light","dark","system"].includes(b.theme))return res.status(400).json({error:"Tema inválido."});
  const r=await pool.query("UPDATE public.profiles SET full_name=COALESCE($2,full_name),theme=COALESCE($3,theme),updated_at=now() WHERE id=$1 RETURNING id,email,full_name,currency,theme",[req.user.id,b.fullName===undefined?null:b.fullName.trim(),b.theme===undefined?null:b.theme]);
  const u=r.rows[0];res.json({user:{id:u.id,email:u.email,fullName:u.full_name,currency:u.currency,theme:u.theme}});
}));

app.get("/api/categories",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT id,name,kind,icon,color,is_default FROM public.categories WHERE user_id=$1 ORDER BY kind,name",[req.user.id]);res.json({categories:r.rows});
}));
app.post("/api/categories",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{};
  if(typeof b.name!=="string"||b.name.trim().length<2||b.name.trim().length>40||!["income","expense"].includes(b.kind))return res.status(400).json({error:"Informe nome e tipo de categoria válidos."});
  const color=/^#[0-9a-fA-F]{6}$/.test(b.color)?b.color:"#64748B";
  const r=await pool.query("INSERT INTO public.categories(user_id,name,kind,icon,color,is_default) VALUES($1,$2,$3,$4,$5,false) RETURNING *",[req.user.id,b.name.trim(),b.kind,typeof b.icon==="string"?b.icon.slice(0,32):"circle",color]);
  res.status(201).json({category:r.rows[0]});
}));

app.get("/api/accounts",requireAuth,asyncRoute(async(req,res)=>{
  const uid=req.user.id,bounds=monthBounds(saoPauloMonth());
  const [r,rules]=await Promise.all([
    pool.query(
      "SELECT a.id,a.name,a.account_type,a.institution,a.opening_balance,a.color,a.is_active,"+
      "a.opening_balance+COALESCE(SUM(CASE WHEN t.status='paid' AND t.kind='income' THEN t.amount WHEN t.status='paid' AND t.kind='expense' THEN -t.amount WHEN t.status='paid' AND t.kind='transfer' AND t.account_id=a.id THEN -t.amount WHEN t.status='paid' AND t.kind='transfer' AND t.transfer_to_account_id=a.id THEN t.amount ELSE 0 END),0) AS current_balance,"+
      "COALESCE((SELECT SUM(p.amount) FROM public.transactions p WHERE p.user_id=a.user_id AND p.account_id=a.id AND p.kind='expense' AND p.status IN ('pending','overdue')),0) AS pending_commitments "+
      "FROM public.accounts a LEFT JOIN public.transactions t ON (t.account_id=a.id OR t.transfer_to_account_id=a.id) AND t.user_id=a.user_id "+
      "WHERE a.user_id=$1 AND a.is_active=true GROUP BY a.id ORDER BY a.created_at",[uid]),
    pool.query("SELECT id,account_id,description,amount,frequency,next_due FROM public.recurring_rules WHERE user_id=$1 AND kind='expense' AND is_active=true AND account_id IS NOT NULL",[uid])
  ]);
  const fixedByAccount={};
  for(const rule of rules.rows){const total=buildRecurringForecast(rule,bounds[1]).period_total;fixedByAccount[rule.account_id]=(fixedByAccount[rule.account_id]||0)+total;}
  const accounts=r.rows.map(a=>{const fixed=asNumber(fixedByAccount[a.id]),pending=asNumber(a.pending_commitments);return {...a,fixed_commitments:fixed,total_committed:pending+fixed,projected_balance:asNumber(a.current_balance)-pending-fixed};});
  res.json({accounts});
}));
app.post("/api/accounts",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},accountType=typeof b.accountType==="string"?b.accountType.trim():"",opening=Number(b.openingBalance||0);
  if(typeof b.name!=="string"||b.name.trim().length<2||b.name.trim().length>60||accountType.length<2||accountType.length>40||accountType==="__new__"||accountType.split("").some(ch=>ch.charCodeAt(0)<32)||!Number.isFinite(opening)||opening<0)return res.status(400).json({error:"Confira os dados da conta e o tipo informado."});
  const color=/^#[0-9a-fA-F]{6}$/.test(b.color)?b.color:"#4169E1";
  const r=await pool.query("INSERT INTO public.accounts(user_id,name,account_type,institution,opening_balance,color) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[req.user.id,b.name.trim(),accountType,typeof b.institution==="string"?b.institution.trim().slice(0,80):null,opening,color]);
  res.status(201).json({account:r.rows[0]});
}));
app.patch("/api/accounts/:id",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},accountType=typeof b.accountType==="string"?b.accountType.trim():"",opening=Number(b.openingBalance);
  if(typeof b.name!=="string"||b.name.trim().length<2||b.name.trim().length>60||accountType.length<2||accountType.length>40||accountType==="__new__"||accountType.split("").some(ch=>ch.charCodeAt(0)<32)||!Number.isFinite(opening)||opening<0)return res.status(400).json({error:"Confira os dados da conta e o tipo informado."});
  const r=await pool.query("UPDATE public.accounts SET name=$3,account_type=$4,institution=$5,opening_balance=$6 WHERE id=$1 AND user_id=$2 AND is_active=true RETURNING id",[req.params.id,req.user.id,b.name.trim(),accountType,typeof b.institution==="string"?b.institution.trim().slice(0,80):null,opening]);
  if(!r.rowCount)return res.status(404).json({error:"Conta não encontrada."});
  res.json({ok:true,account:{id:r.rows[0].id}});
}));
app.delete("/api/accounts/:id",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("UPDATE public.accounts SET is_active=false WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:"Conta não encontrada."});res.json({ok:true});
}));

app.get("/api/transactions",requireAuth,asyncRoute(async(req,res)=>{
  const values=[req.user.id];let filter="";
  if(req.query.month&&/^\d{4}-\d{2}$/.test(req.query.month)){const bounds=monthBounds(req.query.month);values.push(bounds[0],bounds[1]);filter=" AND t.occurred_on >= $2::date AND t.occurred_on < $3::date";}
  const r=await pool.query(
    "SELECT t.id,t.kind,t.description,t.amount,t.occurred_on,t.due_on,t.status,t.payment_method,t.notes,t.account_id,t.transfer_to_account_id,t.category_id,t.card_id,t.installment_number,t.installment_total,"+
    "c.name AS category_name,a.name AS account_name,ca.name AS card_name FROM public.transactions t "+
    "LEFT JOIN public.categories c ON c.id=t.category_id LEFT JOIN public.accounts a ON a.id=t.account_id LEFT JOIN public.cards ca ON ca.id=t.card_id "+
    "WHERE t.user_id=$1"+filter+" ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 500",values);
  res.json({transactions:r.rows});
}));
app.post("/api/transactions",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},kind=b.kind,description=typeof b.description==="string"?b.description.trim():"",amount=Number(b.amount),occurred=b.occurredOn,status=b.status||"paid";
  if(!["income","expense","transfer"].includes(kind)||description.length<2||description.length>120||!Number.isFinite(amount)||amount<=0||amount>999999999||!validDate(occurred)||!["paid","pending","overdue"].includes(status))return res.status(400).json({error:"Confira descrição, tipo, valor, data e situação do lançamento."});
  if(b.accountId&&!(await owned("public.accounts",b.accountId,req.user.id)))return res.status(400).json({error:"Conta não encontrada."});
  if(b.categoryId&&!(await owned("public.categories",b.categoryId,req.user.id)))return res.status(400).json({error:"Categoria não encontrada."});
  if(b.cardId&&!(await owned("public.cards",b.cardId,req.user.id)))return res.status(400).json({error:"Cartão não encontrado."});
  if(kind==="transfer"&&(!b.accountId||!b.transferToAccountId||b.accountId===b.transferToAccountId||!(await owned("public.accounts",b.transferToAccountId,req.user.id))))return res.status(400).json({error:"Selecione duas contas diferentes para a transferência."});
  const installments=kind==="expense"?Math.min(48,Math.max(1,Number(b.installments)||1)):1,group=installments>1?crypto.randomUUID():null,client=await pool.connect();
  try{
    await client.query("BEGIN");const ids=[];
    for(let i=0;i<installments;i++){
      const d=new Date(occurred+"T12:00:00Z"),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+i);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));const date=d.toISOString().slice(0,10);
      const dueBase=b.dueOn&&validDate(b.dueOn)?b.dueOn:occurred,dueDate=new Date(dueBase+"T12:00:00Z"),dueDay=dueDate.getUTCDate();dueDate.setUTCDate(1);dueDate.setUTCMonth(dueDate.getUTCMonth()+i);dueDate.setUTCDate(Math.min(dueDay,new Date(Date.UTC(dueDate.getUTCFullYear(),dueDate.getUTCMonth()+1,0)).getUTCDate()));const dueValue=dueDate.toISOString().slice(0,10);
      const title=installments>1?description+" ("+(i+1)+"/"+installments+")":description;
      const r=await client.query(
        "INSERT INTO public.transactions(user_id,account_id,category_id,kind,description,amount,occurred_on,due_on,status,payment_method,notes,card_id,transfer_to_account_id,installment_group,installment_number,installment_total) "+
        "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id",
        [req.user.id,b.accountId||null,b.categoryId||null,kind,title,amount,date,dueValue,status,b.paymentMethod||null,typeof b.notes==="string"?b.notes.slice(0,500):null,b.cardId||null,b.transferToAccountId||null,group,installments>1?i+1:null,installments>1?installments:null]);
      ids.push(r.rows[0].id);
    }
    await client.query("COMMIT");res.status(201).json({ok:true,created:ids.length,ids});
  }catch(err){await client.query("ROLLBACK");throw err;}finally{client.release();}
}));
app.patch("/api/transactions/:id",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},kind=b.kind,description=typeof b.description==="string"?b.description.trim():"",amount=Number(b.amount),occurred=b.occurredOn,status=b.status||"paid",dueOn=b.dueOn||null;
  if(!["income","expense","transfer"].includes(kind)||description.length<2||description.length>120||!Number.isFinite(amount)||amount<=0||amount>999999999||!validDate(occurred)||!["paid","pending","overdue","cancelled"].includes(status))return res.status(400).json({error:"Confira descrição, tipo, valor, data e situação do lançamento."});
  if(dueOn&&!validDate(dueOn))return res.status(400).json({error:"Informe uma data de vencimento válida."});
  const accountId=b.accountId||null,categoryId=kind==="transfer"?null:(b.categoryId||null),cardId=kind==="expense"?(b.cardId||null):null,transferToAccountId=kind==="transfer"?(b.transferToAccountId||null):null;
  if(accountId&&!(await owned("public.accounts",accountId,req.user.id)))return res.status(400).json({error:"Conta não encontrada."});
  if(categoryId&&!(await owned("public.categories",categoryId,req.user.id)))return res.status(400).json({error:"Categoria não encontrada."});
  if(cardId&&!(await owned("public.cards",cardId,req.user.id)))return res.status(400).json({error:"Cartão não encontrado."});
  if(kind==="transfer"&&(!accountId||!transferToAccountId||accountId===transferToAccountId||!(await owned("public.accounts",transferToAccountId,req.user.id))))return res.status(400).json({error:"Selecione duas contas diferentes para a transferência."});
  const notes=typeof b.notes==="string"?b.notes.slice(0,500):null;
  const r=await pool.query("UPDATE public.transactions SET account_id=$3,category_id=$4,kind=$5,description=$6,amount=$7,occurred_on=$8,due_on=$9,status=$10,notes=$11,card_id=$12,transfer_to_account_id=$13,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id,accountId,categoryId,kind,description,amount,occurred,dueOn,status,notes,cardId,transferToAccountId]);
  if(!r.rowCount)return res.status(404).json({error:"Lançamento não encontrado."});
  res.json({ok:true,transaction:{id:r.rows[0].id}});
}));
app.delete("/api/transactions/:id",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM public.transactions WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:"Lançamento não encontrado."});res.json({ok:true});
}));
app.patch("/api/transactions/:id/status",requireAuth,asyncRoute(async(req,res)=>{
  const status=req.body&&req.body.status;if(!["paid","pending","overdue","cancelled"].includes(status))return res.status(400).json({error:"Situação inválida."});
  const r=await pool.query("UPDATE public.transactions SET status=$3,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id,status",[req.params.id,req.user.id,status]);
  if(!r.rowCount)return res.status(404).json({error:"Lançamento não encontrado."});res.json({transaction:r.rows[0]});
}));

app.get("/api/cards",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT c.id,c.name,c.brand,c.last_four,c.credit_limit,c.closing_day,c.due_day,COALESCE(SUM(t.amount) FILTER(WHERE t.status IN ('pending','overdue') AND t.kind='expense'),0) AS used_amount FROM public.cards c LEFT JOIN public.transactions t ON t.card_id=c.id AND t.user_id=c.user_id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at",[req.user.id]);
  res.json({cards:r.rows});
}));
app.post("/api/cards",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},limit=Number(b.creditLimit||0),closing=Number(b.closingDay),due=Number(b.dueDay);
  if(typeof b.name!=="string"||b.name.trim().length<2||!Number.isFinite(limit)||limit<0||!Number.isInteger(closing)||closing<1||closing>31||!Number.isInteger(due)||due<1||due>31)return res.status(400).json({error:"Confira nome, limite e datas do cartão."});
  const last=typeof b.lastFour==="string"&&/^\d{4}$/.test(b.lastFour)?b.lastFour:null;
  const r=await pool.query("INSERT INTO public.cards(user_id,name,brand,last_four,credit_limit,closing_day,due_day) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[req.user.id,b.name.trim(),typeof b.brand==="string"?b.brand.slice(0,30):null,last,limit,closing,due]);
  res.status(201).json({card:r.rows[0]});
}));
app.delete("/api/cards/:id",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM public.cards WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:"Cartão não encontrado."});res.json({ok:true});
}));

app.get("/api/budgets",requireAuth,asyncRoute(async(req,res)=>{
  const month=/^\d{4}-\d{2}$/.test(req.query.month||"")?req.query.month:new Date().toISOString().slice(0,7),bounds=monthBounds(month);
  const r=await pool.query("SELECT b.id,b.month,b.limit_amount,c.id AS category_id,c.name AS category_name,c.color,COALESCE(SUM(t.amount) FILTER(WHERE t.kind='expense' AND t.status='paid'),0) AS spent "+
    "FROM public.budgets b LEFT JOIN public.categories c ON c.id=b.category_id LEFT JOIN public.transactions t ON t.user_id=b.user_id AND t.category_id=b.category_id AND t.occurred_on >= $2::date AND t.occurred_on < $3::date "+
    "WHERE b.user_id=$1 AND b.month=$4::date GROUP BY b.id,c.id ORDER BY c.name",[req.user.id,bounds[0],bounds[1],bounds[0]]);
  res.json({budgets:r.rows});
}));
app.post("/api/budgets",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},limit=Number(b.limitAmount),month=b.month;
  if(!b.categoryId||!(await owned("public.categories",b.categoryId,req.user.id))||!Number.isFinite(limit)||limit<=0||! /^\d{4}-\d{2}$/.test(month||""))return res.status(400).json({error:"Informe categoria, mês e limite válido."});
  const r=await pool.query("INSERT INTO public.budgets(user_id,category_id,month,limit_amount) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,category_id,month) DO UPDATE SET limit_amount=EXCLUDED.limit_amount RETURNING *",[req.user.id,b.categoryId,month+"-01",limit]);
  res.status(201).json({budget:r.rows[0]});
}));
app.delete("/api/budgets/:id",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM public.budgets WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:"Orçamento não encontrado."});res.json({ok:true});
}));

app.get("/api/goals",requireAuth,asyncRoute(async(req,res)=>{const r=await pool.query("SELECT id,name,target_amount,current_amount,target_date,created_at FROM public.goals WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id]);res.json({goals:r.rows});}));
app.post("/api/goals",requireAuth,asyncRoute(async(req,res)=>{
  const b=req.body||{},target=Number(b.targetAmount),current=Number(b.currentAmount||0);
  if(typeof b.name!=="string"||b.name.trim().length<2||!Number.isFinite(target)||target<=0||!Number.isFinite(current)||current<0||(b.targetDate&&!validDate(b.targetDate)))return res.status(400).json({error:"Confira nome, valor e data da meta."});
  const r=await pool.query("INSERT INTO public.goals(user_id,name,target_amount,current_amount,target_date) VALUES($1,$2,$3,$4,$5) RETURNING *",[req.user.id,b.name.trim(),target,current,b.targetDate||null]);res.status(201).json({goal:r.rows[0]});
}));
app.patch("/api/goals/:id/contribute",requireAuth,asyncRoute(async(req,res)=>{
  const amount=Number(req.body&&req.body.amount);if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:"Informe um valor válido."});
  const r=await pool.query("UPDATE public.goals SET current_amount=current_amount+$3 WHERE id=$1 AND user_id=$2 RETURNING *",[req.params.id,req.user.id,amount]);
  if(!r.rowCount)return res.status(404).json({error:"Meta não encontrada."});res.json({goal:r.rows[0]});
}));
app.delete("/api/goals/:id",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("DELETE FROM public.goals WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
  if(!r.rowCount)return res.status(404).json({error:"Meta não encontrada."});res.json({ok:true});
}));


app.post("/api/recurring/auto-generate",requireAuth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const today=saoPauloToday(),rules=await client.query("SELECT * FROM public.recurring_rules WHERE user_id=$1 AND is_active=true AND next_due <= $2::date ORDER BY next_due FOR UPDATE",[req.user.id,today]);
  let created=0,processed=0,backlog=false;
  for(const rule of rules.rows){
   let due=String(rule.next_due).slice(0,10),iterations=0;
   while(due<=today&&iterations<240){
    const inserted=await client.query(
     "INSERT INTO public.transactions(user_id,account_id,category_id,kind,description,amount,occurred_on,due_on,status,is_recurring,recurring_rule_id,recurring_due_on) "+
     "VALUES($1,$2,$3,$4,$5,$6,$7,$7,'pending',true,$8,$7) "+
     "ON CONFLICT (recurring_rule_id,recurring_due_on) WHERE recurring_rule_id IS NOT NULL DO NOTHING RETURNING id",
     [req.user.id,rule.account_id,rule.category_id,rule.kind,rule.description,rule.amount,due,rule.id]);
    if(inserted.rowCount)created++;
    due=advanceRecurringDate(due,rule.frequency);iterations++;
   }
   if(due<=today)backlog=true;
   await client.query("UPDATE public.recurring_rules SET next_due=$2 WHERE id=$1 AND user_id=$3",[rule.id,due,req.user.id]);
   processed++;
  }
  await client.query("COMMIT");res.json({ok:true,created,processed,backlog});
 }catch(err){await client.query("ROLLBACK");throw err;}finally{client.release();}
}));
app.get("/api/recurring",requireAuth,asyncRoute(async(req,res)=>{
 const r=await pool.query("SELECT r.id,r.description,r.amount,r.kind,r.frequency,r.next_due,r.is_active,r.account_id,r.category_id,a.name AS account_name,c.name AS category_name FROM public.recurring_rules r LEFT JOIN public.accounts a ON a.id=r.account_id LEFT JOIN public.categories c ON c.id=r.category_id WHERE r.user_id=$1 ORDER BY r.next_due",[req.user.id]);
 res.json({recurring:r.rows});
}));
app.post("/api/recurring",requireAuth,asyncRoute(async(req,res)=>{
 const b=req.body||{},amount=Number(b.amount);
 if(typeof b.description!=="string"||b.description.trim().length<2||b.description.trim().length>120||!Number.isFinite(amount)||amount<=0||!["income","expense"].includes(b.kind)||!["weekly","monthly","yearly"].includes(b.frequency)||!validDate(b.nextDue))
  return res.status(400).json({error:"Confira descrição, valor, tipo, frequência e próxima data."});
 if(b.accountId&&!(await owned("public.accounts",b.accountId,req.user.id)))return res.status(400).json({error:"Conta não encontrada."});
 if(b.categoryId&&!(await owned("public.categories",b.categoryId,req.user.id)))return res.status(400).json({error:"Categoria não encontrada."});
 const r=await pool.query("INSERT INTO public.recurring_rules(user_id,account_id,category_id,description,amount,kind,frequency,next_due) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
  [req.user.id,b.accountId||null,b.categoryId||null,b.description.trim(),amount,b.kind,b.frequency,b.nextDue]);
 res.status(201).json({recurring:r.rows[0]});
}));
app.patch("/api/recurring/:id",requireAuth,asyncRoute(async(req,res)=>{
 const active=req.body&&req.body.isActive;if(typeof active!=="boolean")return res.status(400).json({error:"Situação inválida."});
 const r=await pool.query("UPDATE public.recurring_rules SET is_active=$3 WHERE id=$1 AND user_id=$2 RETURNING id,is_active",[req.params.id,req.user.id,active]);
 if(!r.rowCount)return res.status(404).json({error:"Despesa recorrente não encontrada."});
 res.json({recurring:r.rows[0]});
}));
app.delete("/api/recurring/:id",requireAuth,asyncRoute(async(req,res)=>{
 const r=await pool.query("DELETE FROM public.recurring_rules WHERE id=$1 AND user_id=$2 RETURNING id",[req.params.id,req.user.id]);
 if(!r.rowCount)return res.status(404).json({error:"Despesa recorrente não encontrada."});
 res.json({ok:true});
}));
app.post("/api/recurring/:id/record",requireAuth,asyncRoute(async(req,res)=>{
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT * FROM public.recurring_rules WHERE id=$1 AND user_id=$2 AND is_active=true FOR UPDATE",[req.params.id,req.user.id]);
  if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Regra recorrente não encontrada ou inativa."});}
  const rule=found.rows[0],date=String(rule.next_due).slice(0,10),nextDue=advanceRecurringDate(date,rule.frequency);
  const created=await client.query(
   "INSERT INTO public.transactions(user_id,account_id,category_id,kind,description,amount,occurred_on,due_on,status,is_recurring,recurring_rule_id,recurring_due_on) "+
   "VALUES($1,$2,$3,$4,$5,$6,$7,$7,'pending',true,$8,$7) "+
   "ON CONFLICT (recurring_rule_id,recurring_due_on) WHERE recurring_rule_id IS NOT NULL DO NOTHING RETURNING id",
   [req.user.id,rule.account_id,rule.category_id,rule.kind,rule.description,rule.amount,date,rule.id]);
  let transactionId=created.rows[0]?.id;
  if(!transactionId){const existing=await client.query("SELECT id FROM public.transactions WHERE recurring_rule_id=$1 AND recurring_due_on=$2::date",[rule.id,date]);transactionId=existing.rows[0]?.id;}
  await client.query("UPDATE public.recurring_rules SET next_due=$2 WHERE id=$1 AND user_id=$3",[rule.id,nextDue,req.user.id]);
  await client.query("COMMIT");res.status(201).json({ok:true,transactionId,alreadyExisted:!created.rowCount});
 }catch(err){await client.query("ROLLBACK");throw err;}finally{client.release();}
}));

app.get("/api/calendar",requireAuth,asyncRoute(async(req,res)=>{
 const month=/^\d{4}-\d{2}$/.test(req.query.month||"")?req.query.month:saoPauloMonth(),bounds=monthBounds(month),uid=req.user.id;
 const [transactions,rules]=await Promise.all([
  pool.query(
   "SELECT t.id,t.kind,t.description,t.amount,t.occurred_on,t.due_on,t.status,t.account_id,t.transfer_to_account_id,t.category_id,t.card_id,t.installment_number,t.installment_total,t.recurring_rule_id,t.recurring_due_on,"+
   "COALESCE(t.due_on,t.occurred_on) AS event_date,c.name AS category_name,a.name AS account_name,ca.name AS card_name "+
   "FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id LEFT JOIN public.accounts a ON a.id=t.account_id LEFT JOIN public.cards ca ON ca.id=t.card_id "+
   "WHERE t.user_id=$1 AND t.status<>'cancelled' AND COALESCE(t.due_on,t.occurred_on) >= $2::date AND COALESCE(t.due_on,t.occurred_on) < $3::date ORDER BY COALESCE(t.due_on,t.occurred_on),t.created_at",[uid,bounds[0],bounds[1]]),
  pool.query("SELECT r.id,r.account_id,r.category_id,r.description,r.amount,r.kind,r.frequency,r.next_due,a.name AS account_name,c.name AS category_name FROM public.recurring_rules r LEFT JOIN public.accounts a ON a.id=r.account_id LEFT JOIN public.categories c ON c.id=r.category_id WHERE r.user_id=$1 AND r.is_active=true ORDER BY r.next_due",[uid])
 ]);
 const events=transactions.rows.map(t=>({...t,source:"transaction",event_date:String(t.event_date).slice(0,10)})),existing=new Set(transactions.rows.filter(t=>t.recurring_rule_id&&t.recurring_due_on).map(t=>String(t.recurring_rule_id)+":"+String(t.recurring_due_on).slice(0,10)));
 for(const rule of rules.rows)for(const date of recurrenceDatesInRange(rule,bounds[0],bounds[1])){
  if(existing.has(String(rule.id)+":"+date))continue;
  events.push({id:"rec-"+rule.id+"-"+date,source:"recurring",rule_id:rule.id,kind:rule.kind,description:rule.description,amount:rule.amount,status:"scheduled",event_date:date,occurred_on:date,due_on:date,account_id:rule.account_id,category_id:rule.category_id,account_name:rule.account_name,category_name:rule.category_name||"Sem categoria"});
 }
 events.sort((a,b)=>String(a.event_date).localeCompare(String(b.event_date))||String(a.description).localeCompare(String(b.description)));
 res.json({month,events});
}));
app.get("/api/dashboard",requireAuth,asyncRoute(async(req,res)=>{
  const month=/^\d{4}-\d{2}$/.test(req.query.month||"")?req.query.month:new Date().toISOString().slice(0,7),bounds=monthBounds(month),uid=req.user.id;
  const q=[
    pool.query("SELECT a.id,a.name,a.account_type,a.institution,a.color,a.opening_balance,a.opening_balance+COALESCE(SUM(CASE WHEN t.status='paid' AND t.kind='income' THEN t.amount WHEN t.status='paid' AND t.kind='expense' THEN -t.amount WHEN t.status='paid' AND t.kind='transfer' AND t.account_id=a.id THEN -t.amount WHEN t.status='paid' AND t.kind='transfer' AND t.transfer_to_account_id=a.id THEN t.amount ELSE 0 END),0) AS current_balance,COALESCE((SELECT SUM(p.amount) FROM public.transactions p WHERE p.user_id=a.user_id AND p.account_id=a.id AND p.kind='expense' AND p.status IN ('pending','overdue')),0) AS pending_commitments FROM public.accounts a LEFT JOIN public.transactions t ON (t.account_id=a.id OR t.transfer_to_account_id=a.id) AND t.user_id=a.user_id WHERE a.user_id=$1 AND a.is_active=true GROUP BY a.id ORDER BY a.created_at",[uid]),
    pool.query("SELECT COALESCE(SUM(amount) FILTER(WHERE kind='income' AND status='paid' AND occurred_on >= $2::date AND occurred_on < $3::date),0) AS income,COALESCE(SUM(amount) FILTER(WHERE kind='expense' AND status='paid' AND occurred_on >= $2::date AND occurred_on < $3::date),0) AS expense,COALESCE(SUM(amount) FILTER(WHERE kind='income' AND status='pending' AND COALESCE(due_on,occurred_on) >= $2::date AND COALESCE(due_on,occurred_on) < $3::date),0) AS pending_income,COALESCE(SUM(amount) FILTER(WHERE kind='expense' AND status IN ('pending','overdue') AND COALESCE(due_on,occurred_on) >= $2::date AND COALESCE(due_on,occurred_on) < $3::date),0) AS pending_expense_month,COALESCE(SUM(amount) FILTER(WHERE kind='expense' AND status IN ('pending','overdue')),0) AS pending_expense,(SELECT COALESCE(SUM(t2.amount),0) FROM public.transactions t2 WHERE t2.user_id=$1 AND t2.kind='expense' AND t2.status IN ('pending','overdue') AND COALESCE(t2.due_on,t2.occurred_on) < $3::date) AS outstanding_expense,COUNT(*) AS transaction_count FROM public.transactions WHERE user_id=$1 AND ((occurred_on >= $2::date AND occurred_on < $3::date) OR (status IN ('pending','overdue') AND COALESCE(due_on,occurred_on) >= $2::date AND COALESCE(due_on,occurred_on) < $3::date))",[uid,bounds[0],bounds[1]]),
    pool.query("SELECT COALESCE(c.name,'Sem categoria') AS name,COALESCE(c.color,'#8792A5') AS color,SUM(t.amount) AS amount FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id WHERE t.user_id=$1 AND t.kind='expense' AND ((t.status='paid' AND t.occurred_on >= $2::date AND t.occurred_on < $3::date) OR (t.status IN ('pending','overdue') AND COALESCE(t.due_on,t.occurred_on) >= $2::date AND COALESCE(t.due_on,t.occurred_on) < $3::date)) GROUP BY c.name,c.color ORDER BY amount DESC LIMIT 7",[uid,bounds[0],bounds[1]]),
    pool.query("SELECT to_char(date_trunc('month',occurred_on),'YYYY-MM') AS month,COALESCE(SUM(amount) FILTER(WHERE kind='income' AND status='paid'),0) AS income,COALESCE(SUM(amount) FILTER(WHERE kind='expense' AND status='paid'),0) AS expense FROM public.transactions WHERE user_id=$1 AND occurred_on >= (date_trunc('month',$2::date)-interval '5 months')::date AND occurred_on < (date_trunc('month',$2::date)+interval '1 month')::date GROUP BY 1 ORDER BY 1",[uid,bounds[0]]),
    pool.query("SELECT t.id,t.description,t.amount,t.due_on,t.status,t.kind,COALESCE(c.name,'Sem categoria') AS category_name FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id WHERE t.user_id=$1 AND t.status IN ('pending','overdue') AND t.kind IN ('expense','income') ORDER BY t.due_on NULLS LAST LIMIT 6",[uid]),
    pool.query("SELECT t.id,t.kind,t.description,t.amount,t.occurred_on,t.due_on,t.status,COALESCE(c.name,'Sem categoria') AS category_name,a.name AS account_name FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id LEFT JOIN public.accounts a ON a.id=t.account_id WHERE t.user_id=$1 AND t.occurred_on >= $2::date AND t.occurred_on < $3::date ORDER BY t.occurred_on DESC,t.created_at DESC LIMIT 7",[uid,bounds[0],bounds[1]]),
    pool.query("SELECT b.id,b.limit_amount,c.id AS category_id,c.name AS category_name,c.color,COALESCE(SUM(t.amount) FILTER(WHERE t.kind='expense' AND t.status='paid'),0) AS spent FROM public.budgets b JOIN public.categories c ON c.id=b.category_id LEFT JOIN public.transactions t ON t.user_id=b.user_id AND t.category_id=b.category_id AND t.occurred_on >= $2::date AND t.occurred_on < $3::date WHERE b.user_id=$1 AND b.month=$2::date GROUP BY b.id,c.id ORDER BY c.name",[uid,bounds[0],bounds[1]]),
    pool.query("SELECT id,name,target_amount,current_amount,target_date FROM public.goals WHERE user_id=$1 ORDER BY created_at DESC LIMIT 4",[uid]),
    pool.query("SELECT c.id,c.name,c.brand,c.last_four,c.credit_limit,c.closing_day,c.due_day,COALESCE(SUM(t.amount) FILTER(WHERE t.status IN ('pending','overdue') AND t.kind='expense'),0) AS used_amount FROM public.cards c LEFT JOIN public.transactions t ON t.card_id=c.id AND t.user_id=c.user_id WHERE c.user_id=$1 GROUP BY c.id ORDER BY c.created_at DESC LIMIT 4",[uid]),
    pool.query("SELECT r.id,r.account_id,r.category_id,r.description,r.amount,r.frequency,r.next_due,a.name AS account_name,COALESCE(c.name,'Sem categoria') AS category_name FROM public.recurring_rules r LEFT JOIN public.accounts a ON a.id=r.account_id LEFT JOIN public.categories c ON c.id=r.category_id WHERE r.user_id=$1 AND r.kind='expense' AND r.is_active=true ORDER BY r.next_due,r.created_at",[uid]),
    pool.query("SELECT t.id,t.description,t.amount,t.occurred_on,t.due_on,t.status,COALESCE(c.name,'Sem categoria') AS category_name,a.name AS account_name FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id LEFT JOIN public.accounts a ON a.id=t.account_id WHERE t.user_id=$1 AND t.kind='expense' AND t.status<>'cancelled' AND ((t.status='paid' AND t.occurred_on >= $2::date AND t.occurred_on < $3::date) OR (t.status IN ('pending','overdue') AND COALESCE(t.due_on,t.occurred_on) < $3::date)) ORDER BY t.created_at DESC,COALESCE(t.due_on,t.occurred_on) ASC LIMIT 12",[uid,bounds[0],bounds[1]]),
    pool.query("SELECT t.id,t.kind,t.description,t.amount,t.occurred_on,t.due_on,t.status,t.recurring_rule_id,t.recurring_due_on,COALESCE(c.name,'Sem categoria') AS category_name,a.name AS account_name FROM public.transactions t LEFT JOIN public.categories c ON c.id=t.category_id LEFT JOIN public.accounts a ON a.id=t.account_id WHERE t.user_id=$1 AND t.status IN ('pending','overdue') AND t.kind IN ('expense','income') AND COALESCE(t.due_on,t.occurred_on) <= ((now() AT TIME ZONE 'America/Sao_Paulo')::date + 7) ORDER BY COALESCE(t.due_on,t.occurred_on),t.created_at LIMIT 30",[uid])
  ];
  const results=await Promise.all(q),accounts=results[0].rows,totals=results[1].rows[0],balance=accounts.reduce((s,a)=>s+asNumber(a.current_balance),0),fixedExpenses=results[9].rows.map(rule=>buildRecurringForecast(rule,bounds[1])).sort((a,b)=>a.due_on.localeCompare(b.due_on)||a.description.localeCompare(b.description)),fixedExpenseTotal=fixedExpenses.reduce((sum,item)=>sum+item.period_total,0),outstandingExpense=asNumber(totals.outstanding_expense),committedExpense=outstandingExpense+fixedExpenseTotal,expenseTotal=asNumber(totals.expense)+asNumber(totals.pending_expense_month);
  const fixedByAccount={};for(const item of fixedExpenses)if(item.account_id)fixedByAccount[item.account_id]=(fixedByAccount[item.account_id]||0)+item.period_total;
  for(const account of accounts){const fixed=asNumber(fixedByAccount[account.id]),pending=asNumber(account.pending_commitments);account.fixed_commitments=fixed;account.total_committed=pending+fixed;account.projected_balance=asNumber(account.current_balance)-pending-fixed;}
  const today=saoPauloToday(),alerts=[];
  for(const t of results[11].rows){const due=String(t.due_on||t.occurred_on).slice(0,10),days=dateDifference(today,due),isExpense=t.kind==="expense";alerts.push({type:days<0?"overdue":"upcoming",priority:days<0?1:days<=3?2:3,title:days<0?(isExpense?"Pagamento atrasado":"Recebimento atrasado"):(isExpense?"Conta próxima do vencimento":"Recebimento previsto"),description:t.description,amount:asNumber(t.amount),date:due,detail:(t.account_name||t.category_name||"Sem conta vinculada")+(days<0?" · vencida há "+Math.abs(days)+" dia(s)":days===0?" · vence hoje":" · vence em "+days+" dia(s)")});}
  const existingRecurring=new Set(results[11].rows.filter(t=>t.recurring_rule_id&&t.recurring_due_on).map(t=>String(t.recurring_rule_id)+":"+String(t.recurring_due_on).slice(0,10)));
  for(const rule of results[9].rows){const due=String(rule.next_due).slice(0,10),days=dateDifference(today,due);if(days>=0&&days<=7&&!existingRecurring.has(String(rule.id)+":"+due))alerts.push({type:"upcoming",priority:days<=3?2:3,title:"Despesa fixa próxima do vencimento",description:rule.description,amount:asNumber(rule.amount),date:due,detail:(rule.account_name||rule.category_name||"Sem conta vinculada")+" · vence em "+days+" dia(s)"});}
  if(balance-committedExpense<0)alerts.push({type:"negative",priority:0,title:"Saldo projetado negativo",description:"Os compromissos previstos superam o saldo atual das suas contas.",amount:Math.abs(balance-committedExpense),date:today,detail:"Revise os próximos pagamentos e recebimentos."});
  for(const account of accounts){if(asNumber(account.projected_balance)<0)alerts.push({type:"negative",priority:1,title:"Saldo comprometido: "+account.name,description:"Os pagamentos vinculados a esta conta superam o saldo atual.",amount:Math.abs(asNumber(account.projected_balance)),date:today,detail:"Saldo projetado da conta negativo."});}
  alerts.sort((a,b)=>a.priority-b.priority||a.date.localeCompare(b.date));
  res.json({month,balance,income:asNumber(totals.income),expense:asNumber(totals.expense),expenseTotal,pendingExpenseMonth:asNumber(totals.pending_expense_month),pendingIncome:asNumber(totals.pending_income),pendingExpense:asNumber(totals.pending_expense),outstandingExpense,fixedExpenseTotal,committedExpense,projectedBalance:balance-committedExpense,fixedExpenses,expenseTransactions:results[10].rows,alerts:alerts.slice(0,10),transactionCount:Number(totals.transaction_count),accounts,categories:results[2].rows,chart:results[3].rows,upcoming:results[4].rows,transactions:results[5].rows,budgets:results[6].rows,goals:results[7].rows,cards:results[8].rows});
}));

app.use("/api",(_req,res)=>res.status(404).json({error:"Rota não encontrada."}));
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"],maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.get("*",(req,res,next)=>{if(req.path.startsWith("/api/"))return next();res.sendFile(path.join(__dirname,"public","index.html"));});
app.use((err,_req,res,_next)=>{console.error(err);if(!res.headersSent)res.status(500).json({error:"Não foi possível concluir a operação. Tente novamente."});});
const server=app.listen(PORT,"0.0.0.0",()=>console.log("TVC Control listening on",PORT));
process.on("SIGTERM",()=>server.close(()=>pool.end()));
