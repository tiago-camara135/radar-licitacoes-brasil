// Batch the existing parameterized upsert without changing its conflict policy.
// Duplicate IDs are kept in original order, but never in the same statement.
export async function batchedProcurementUpsert(client, sql, rows, {batchSize=50, onResult}={}) {
  const single='($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())';
  if(!sql.includes(single)) throw new Error('Unexpected procurement upsert template');
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>100) throw new Error('Invalid batch size');
  let chunk=[], ids=new Set();
  async function flush(){
    if(!chunk.length)return;
    const tuples=chunk.map((_,i)=>'('+Array.from({length:20},(_,j)=>'$'+(i*20+j+1)).join(',')+',NOW())').join(',');
    const result=await client.query(sql.replace(single,tuples),chunk.flatMap(row=>row.values));
    if(onResult){
      const returned=new Map(result.rows.map(row=>[row.pncp_id,row]));
      for(const row of chunk)onResult(row,returned.get(row.values[0]));
    }
    chunk=[];ids=new Set();
  }
  for(const row of rows){
    if(!Array.isArray(row.values)||row.values.length!==20)throw new Error('Expected 20 procurement values');
    const id=row.values[0];
    if(chunk.length>=batchSize||ids.has(id))await flush();
    chunk.push(row);ids.add(id);
  }
  await flush();
}
