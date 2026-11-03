import { initTenderComplianceMatrixV3,handleTenderComplianceMatrixV3Route } from './tender-compliance-matrix-v3.mjs';

const TECHNICAL=new Set(['atestado_tecnico','acervo_tecnico','registro_conselho','licenca']);
const WEIGHT={verified:1,near_expiry:.92,valid_today:.86,apparently_compatible:.8,partial_match:.58,identity_unconfirmed:.65,content_unconfirmed:.5,manual_review:.45,unknown_validity:.48,to_prepare:.3,conditional_pending:.5,not_met:0,missing:0,expired_at_reference:0};
const weight=s=>WEIGHT[s]??.45;
const level=v=>v>=90?'muito_alta':v>=80?'alta':v>=65?'moderada':'baixa';

export function applyTechnicalQuantitySafetyV3(matrix){
  if(!matrix||matrix.version!=='3.0'||!Array.isArray(matrix.requirements))return matrix;
  let guarded=0;
  for(const row of matrix.requirements){
    if(!TECHNICAL.has(row?.type))continue;
    const q=(row.criteria||[]).find(x=>x?.code==='quantitative');
    if(!q||q.status!=='pass')continue;
    const candidates=Array.isArray(row.candidate_documents)?row.candidate_documents:[];
    const strong=candidates.filter(c=>c?.semantic?.status==='pass');
    const ambiguous=candidates.length!==1||strong.length!==1||strong[0]?.id!==candidates[0]?.id;
    if(!ambiguous)continue;
    q.status='review';
    q.label='Quantitativo exige confirmação no documento tecnicamente aderente';
    q.evidence=[q.evidence,'O Radar não considera quantidade isolada como prova suficiente quando há múltiplos documentos ou aderência semântica ambígua.'].filter(Boolean).join(' ');
    if(row.state==='apparently_compatible'){
      row.state='partial_match';
      row.status_label='Compatibilidade técnica parcial — quantitativo a confirmar';
      row.detail='Há aderência técnica, mas o quantitativo precisa ser confirmado no documento efetivamente compatível com a exigência.';
    }
    row.confidence=Math.min(Number(row.confidence||0),82);
    row.readiness_weight=weight(row.state);
    guarded++;
  }
  if(!guarded)return matrix;
  const mandatory=matrix.requirements.filter(x=>x.condition==='obrigatorio'&&x.mandatory!==false),base=mandatory.length?mandatory:matrix.requirements;
  matrix.readiness_score=base.length?Math.round(base.reduce((s,x)=>s+weight(x.state),0)/base.length*100):0;
  matrix.confidence_score=matrix.requirements.length?Math.round(matrix.requirements.reduce((s,x)=>s+Number(x.confidence||0),0)/matrix.requirements.length):0;
  matrix.confidence_level=level(matrix.confidence_score);
  matrix.counts={...(matrix.counts||{}),review:matrix.requirements.filter(x=>['identity_unconfirmed','content_unconfirmed','manual_review','partial_match','apparently_compatible','unknown_validity'].includes(x.state)).length};
  matrix.diagnostics={...(matrix.diagnostics||{}),technical_quantity_semantic_guard:true,technical_quantity_guarded:guarded};
  return matrix;
}

function captureResponse(res){
  const headers=new Map(),chunks=[];
  return{
    get statusCode(){return this._statusCode||200},set statusCode(v){this._statusCode=v},_statusCode:200,
    get headersSent(){return false},
    setHeader(k,v){headers.set(String(k).toLowerCase(),v)},getHeader(k){return headers.get(String(k).toLowerCase())},
    write(chunk){chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));return true},
    end(chunk){if(chunk!==undefined)chunks.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk)));this.ended=true},
    flushTo(target){target.statusCode=this.statusCode;for(const [k,v] of headers)target.setHeader(k,v);const raw=Buffer.concat(chunks).toString('utf8');let body=raw;try{const data=raw?JSON.parse(raw):{};if(data?.matrix)data.matrix=applyTechnicalQuantitySafetyV3(data.matrix);body=JSON.stringify(data)}catch{}target.end(body)},
    ended:false
  };
}

export async function initTenderComplianceMatrixV3Safe(){return initTenderComplianceMatrixV3()}
export async function handleTenderComplianceMatrixV3SafeRoute(req,res,url){
  if(!url.pathname.startsWith('/api/tender-compliance-matrix'))return false;
  if(!((req.method==='POST'&&url.pathname==='/api/tender-compliance-matrix/analyze')||(req.method==='GET'&&url.pathname==='/api/tender-compliance-matrix/latest')))return handleTenderComplianceMatrixV3Route(req,res,url);
  const captured=captureResponse(res),handled=await handleTenderComplianceMatrixV3Route(req,captured,url);
  if(handled)captured.flushTo(res);
  return handled;
}
