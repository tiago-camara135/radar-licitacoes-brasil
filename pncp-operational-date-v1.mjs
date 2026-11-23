const DEFAULT_TIMEZONE='America/Sao_Paulo';

function validTimeZone(value){
  const candidate=String(value||'').trim();
  if(!candidate)return DEFAULT_TIMEZONE;
  try{new Intl.DateTimeFormat('en-US',{timeZone:candidate}).format(new Date());return candidate}catch{return DEFAULT_TIMEZONE}
}

export const PNCP_OPERATION_TIMEZONE=validTimeZone(process.env.PNCP_OPERATION_TIMEZONE||DEFAULT_TIMEZONE);

// The PNCP publishes proposal deadlines in Brasília time, including values without an offset.
export function pncpDeadline(value){
  if(typeof value!=='string')return value;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? value+'-03:00'
    : value;
}

// Read legacy rows that were interpreted as UTC without rewriting monitored or user data.
export function effectivePncpDeadline(alias){
  const stored=alias+'.closes_at';
  const raw="COALESCE(NULLIF("+alias+".raw->>'dataEncerramentoProposta',''),"+alias+".raw->>'dataFimRecebimentoProposta')";
  return `CASE WHEN ${raw} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?$'
    AND TO_CHAR(${stored} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')=LEFT(${raw},19)
    THEN (${stored} AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo'
    ELSE ${stored} END`;
}

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
