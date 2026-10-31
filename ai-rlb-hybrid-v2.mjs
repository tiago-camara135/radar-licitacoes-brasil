import {
  initHybridTables as legacyInitHybridTables,
  hybridStatus as legacyHybridStatus,
  hybridAdminStatus as legacyHybridAdminStatus,
  configureHybridProvider as legacyConfigureHybridProvider,
  removeHybridProvider as legacyRemoveHybridProvider,
  runHybridChat as legacyRunHybridChat
} from './ai-rlb-hybrid.mjs';
import { runForcedGeminiChatV2, runGeminiDiagnostics } from './ai-rlb-gemini-force-v2.mjs';

export const initHybridTables = legacyInitHybridTables;
export const configureHybridProvider = legacyConfigureHybridProvider;
export const removeHybridProvider = legacyRemoveHybridProvider;

export async function hybridAdminStatus(pool){
  const base=await legacyHybridAdminStatus(pool);
  return {...base,
    gemini_direct:base?.provider==='gemini',
    documents_via_gemini:base?.provider==='gemini',
    local_fallback_for_gemini:false,
    planner_mode:base?.provider==='gemini'?'direct_official_evidence':'legacy_hybrid'
  };
}

export async function hybridStatus(pool,base={}){
  const status=await legacyHybridStatus(pool,base);
  return {...status,
    gemini_direct:status?.provider==='gemini',
    documents_via_gemini:status?.provider==='gemini',
    local_fallback_for_gemini:false,
    planner_mode:status?.provider==='gemini'?'direct_official_evidence':'legacy_hybrid'
  };
}

export async function runHybridChat(args){
  const cfg=await legacyHybridAdminStatus(args.pool);
  if(cfg?.configured&&cfg.provider==='gemini'){
    return runForcedGeminiChatV2({pool:args.pool,userId:args.userId,body:args.body,document:args.document});
  }
  return legacyRunHybridChat(args);
}

export async function runHybridDiagnostics(pool){
  const cfg=await legacyHybridAdminStatus(pool);
  if(!cfg?.configured)return {ok:false,configured:false,provider:null,error:'Nenhum provedor externo configurado.'};
  if(cfg.provider!=='gemini')return {ok:false,configured:true,provider:cfg.provider,error:'O diagnóstico avançado desta versão é específico para Gemini.'};
  const d=await runGeminiDiagnostics(pool);
  const checks={
    key:Boolean(d.key),
    official_sources:Boolean(d.sources),
    social:Boolean(d.social),
    legal:Boolean(d.legal),
    context:Boolean(d.context),
    direct_gemini_flow:true,
    documents_via_gemini:true,
    local_fallback_disabled:true
  };
  return {
    ok:Boolean(d.key&&d.sources&&d.social&&d.legal&&d.context),
    configured:true,
    provider:'gemini',
    model:d.details?.legal_model||d.details?.social_model||cfg.model||null,
    checks,
    latency_ms:{social:d.details?.social_ms||null,legal:d.details?.legal_ms||null,context:d.details?.context_ms||null},
    error:d.error||null,
    elapsed_ms:d.elapsed_ms||null,
    forced:true,
    documents_via_gemini:true,
    planner_mode:'direct_official_evidence'
  };
}
