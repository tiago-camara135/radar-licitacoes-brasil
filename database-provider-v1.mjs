export function detectDatabaseProvider(connectionString=''){
  const raw=String(connectionString||'').trim();
  if(!raw)return 'not-configured';
  try{
    const host=new URL(raw).hostname.toLowerCase();
    if(host==='neon.tech'||host.endsWith('.neon.tech'))return 'neon';
    if(host.startsWith('dpg-')||host==='render.com'||host.endsWith('.render.com'))return 'render-postgres';
    return 'external-postgres';
  }catch{
    return 'unknown';
  }
}
