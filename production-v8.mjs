import { types as pgTypes } from 'pg';

// PostgreSQL DATE (OID 1082) must stay as the literal YYYY-MM-DD value.
// The habilitation modules compare certificate issue/expiry dates by calendar day;
// converting DATE to a JavaScript Date can shift or stringify the value and break status detection.
pgTypes.setTypeParser(1082, value => value);

const sampleDate=pgTypes.getTypeParser(1082)('2026-10-20');
if(sampleDate!=='2026-10-20')throw new Error('Falha ao normalizar datas PostgreSQL DATE.');

await import('./production-v7.mjs');
console.log('date normalization ready: PostgreSQL DATE preserved as YYYY-MM-DD');
