const DEFAULT_TIMEZONE='America/Sao_Paulo';

function validTimeZone(value){
  const candidate=String(value||'').trim();
  if(!candidate)return DEFAULT_TIMEZONE;
  try{new Intl.DateTimeFormat('en-US',{timeZone:candidate}).format(new Date());return candidate}catch{return DEFAULT_TIMEZONE}
}

export const PNCP_OPERATION_TIMEZONE=validTimeZone(process.env.PNCP_OPERATION_TIMEZONE||DEFAULT_TIMEZONE);

export function pncpOperationalDate(now=new Date(),timeZone=PNCP_OPERATION_TIMEZONE){
  const instant=now instanceof Date?now:new Date(now);
  if(Number.isNaN(instant.getTime()))throw new TypeError('Data inválida para o monitor PNCP.');
  const tz=validTimeZone(timeZone);
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const values=Object.fromEntries(parts.filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,p.value]));
  return new Date(Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),12,0,0,0));
}

export function pncpOperationalYmd(now=new Date(),timeZone=PNCP_OPERATION_TIMEZONE){
  return pncpOperationalDate(now,timeZone).toISOString().slice(0,10).replaceAll('-','');
}
