from __future__ import annotations

import asyncio
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import settings
from app.core.signal_engine import analyze_multiframe
from app.providers import otcharts, binance
from app.db import (
    init_db,
    record_broker_signal,
    resolve_from_candles,
    history,
    calibration_for,
    calibration_table,
    backend_name,
)

VERSION = "0.6.0"
ROOT = Path(__file__).resolve().parent
app = FastAPI(title=settings.app_name, version=VERSION)
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

BROKERS = {
    "pocket": {"name": "Pocket Option", "venue": "otc", "status": "supported", "markets": ["otc"], "clock_note": "Candles normalizados de UTC+2 para UTC"},
    "quotex": {"name": "Quotex", "venue": "quotex", "status": "supported", "markets": ["otc"]},
    "iqoption": {"name": "IQ Option", "venue": "iq", "status": "supported", "markets": ["otc"]},
    "bullex": {"name": "Bullex", "venue": None, "status": "pending", "markets": ["otc"]},
}

_sessions: dict[str, dict[str, Any]] = {}
_cache: dict[str, tuple[float, Any]] = {}
CACHE_SECONDS = 35
SESSION_TTL = 21600

class BrokerConnect(BaseModel):
    api_key: str = ""

def _clean_sessions() -> None:
    now = time.time()
    for sid in list(_sessions):
        if _sessions[sid]["expires"] < now:
            _sessions.pop(sid, None)

def _session(session_id: str) -> dict[str, Any]:
    _clean_sessions()
    row = _sessions.get(session_id)
    if not row:
        raise HTTPException(401, "Sessão Broker Feed ausente ou expirada")
    return row

def _broker(broker: str) -> dict[str, Any]:
    row = BROKERS.get(broker.lower())
    if not row:
        raise HTTPException(404, "Corretora não suportada")
    if row["status"] != "supported":
        raise HTTPException(501, "Conector Bullex ainda não possui uma fonte de dados confiável")
    return row

def _venue_for(broker: str, session_id: str) -> tuple[dict[str, Any], dict[str, Any], str]:
    b = _broker(broker)
    s = _session(session_id)
    venue = b["venue"]
    enabled = s.get("enabled_books") or []
    if venue not in enabled:
        raise HTTPException(403, f"Sua chave OTCharts não abre o book {b['name']}. Ative esse book na conta OTCharts ou use uma chave compatível.")
    return b, s, venue

async def _cached(key: str, fn):
    row = _cache.get(key)
    now = time.time()
    if row and now - row[0] < CACHE_SECONDS:
        return row[1]
    value = await fn()
    _cache[key] = (now, value)
    return value

async def _frames(venue: str, symbol: str, api_key: str) -> tuple[dict[str, list[dict]], dict[str, Any]]:
    async def load(tf: int, limit: int):
        key = f"c:{venue}:{symbol}:{tf}"
        return await _cached(key, lambda: otcharts.candles(venue, symbol, tf, api_key, limit))
    p1, p5, p60 = await asyncio.gather(load(60, 360), load(300, 220), load(3600, 140))
    frames = {"1m": p1.get("candles", []), "5m": p5.get("candles", []), "1h": p60.get("candles", [])}
    meta = {
        "open": p1.get("open"), "payout": p1.get("payout"), "isOtc": p1.get("isOtc"), "exhausted": p1.get("exhausted"),
        "gaps": {
            "1m": p1.get("gaps") or {"runs": 0, "missingBars": 0},
            "5m": p5.get("gaps") or {"runs": 0, "missingBars": 0},
            "1h": p60.get("gaps") or {"runs": 0, "missingBars": 0},
        },
    }
    return frames, meta

def _feed_age(candles: list[dict]) -> int | None:
    if not candles:
        return None
    return max(0, int(time.time()) - (int(candles[-1]["time"]) + 60))

def _blocked_quality(meta: dict[str, Any], feed_age: int | None, min_payout: float) -> list[str]:
    blocked: list[str] = []
    if meta.get("open") is False:
        blocked.append("Ativo fechado pela corretora")
    if feed_age is None or feed_age > 150:
        blocked.append("Feed sem candle recente")
    missing = int((meta.get("gaps", {}).get("1m", {}) or {}).get("missingBars") or 0)
    if missing >= 4:
        blocked.append(f"Histórico M1 possui {missing} candles ausentes")
    payout = meta.get("payout")
    if payout is not None and float(payout) < min_payout:
        blocked.append(f"Payout abaixo do mínimo ({float(payout):.0f}% < {min_payout:.0f}%)")
    return blocked

async def _create_session(key: str, source: str) -> dict[str, Any]:
    try:
        venue_data = await otcharts.venues(key)
        usage = await otcharts.usage(key)
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code, str(exc))
    venues = venue_data.get("venues") or []
    enabled_books = [v.get("id") for v in venues if v.get("open") is True and v.get("id")]
    sid = secrets.token_urlsafe(24)
    _sessions[sid] = {"key": key, "expires": time.time() + SESSION_TTL, "enabled_books": enabled_books, "usage": usage, "venues": venues, "source": source}
    return {"ok": True, "session_id": sid, "expires_in": SESSION_TTL, "enabled_books": enabled_books, "venues": venues, "usage": usage, "source": source}

@app.middleware("http")
async def development_cache_guard(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/")
async def index():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    bootstrap = '<script src="/static/server_bootstrap.js?v=0.6.0"></script>'
    if bootstrap not in html:
        html = html.replace("</body>", f"{bootstrap}\n</body>")
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})

@app.get("/api/health")
async def health():
    return {"ok": True, "app": settings.app_name, "version": VERSION, "mode": "broker-signal-engine", "database": backend_name(), "server_time": int(time.time()), "server_broker_key_configured": bool(settings.otcharts_api_key)}

@app.get("/api/diagnostics")
async def diagnostics():
    return {"ok": True, "version": VERSION, "database": backend_name(), "broker_feed": "OTCharts read-only", "broker_key_required": not bool(settings.otcharts_api_key), "server_broker_key_configured": bool(settings.otcharts_api_key), "supported_brokers": [k for k,v in BROKERS.items() if v["status"] == "supported"], "pending_connectors": [k for k,v in BROKERS.items() if v["status"] != "supported"], "cache_seconds": CACHE_SECONDS, "session_ttl_seconds": SESSION_TTL}

@app.get("/api/brokers")
async def brokers():
    return {"brokers": BROKERS, "otcharts": {"venues": {"pocket": "otc", "quotex": "quotex", "iqoption": "iq"}, "streaming": "plan-dependent", "real_market_book": "forex", "server_key_configured": bool(settings.otcharts_api_key)}}

@app.post("/api/broker/connect")
async def connect(body: BrokerConnect):
    key = body.api_key.strip()
    if not key:
        raise HTTPException(400, "Informe a OTCharts API Key")
    return await _create_session(key, "browser")

@app.post("/api/broker/bootstrap")
async def broker_bootstrap():
    key = settings.otcharts_api_key.strip()
    if not key:
        raise HTTPException(409, "OTCharts ainda não configurado no servidor")
    return await _create_session(key, "server")

@app.get("/api/broker/session")
async def broker_session(session: str):
    row = _session(session)
    return {"ok": True, "expires_in": max(0, int(row["expires"] - time.time())), "enabled_books": row.get("enabled_books", []), "usage": row.get("usage", {}), "source": row.get("source", "browser")}

@app.get("/api/broker/symbols")
async def broker_symbols(broker: str, session: str, market: str = "otc"):
    if market != "otc":
        raise HTTPException(400, "Para corretoras, esta versão usa somente o book OTC próprio. Mercado real é uma fonte separada.")
    b, s, venue = _venue_for(broker, session)
    try:
        payload = await _cached(f"s:{venue}", lambda: otcharts.symbols(venue, s["key"]))
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code, str(exc))
    rows = [x for x in payload.get("symbols", []) if x.get("isOtc") is not False]
    rows = sorted(rows, key=lambda x: (not bool(x.get("open", True)), x.get("name") or x.get("symbol") or ""))
    return {"broker": broker, "broker_name": b["name"], "venue": venue, "market": "otc", "count": len(rows), "symbols": rows, "usage": s.get("usage", {})}

@app.get("/api/broker/analysis")
async def broker_analysis(broker: str, symbol: str, session: str, market: str = "otc", min_score: float = Query(settings.signal_threshold, ge=55, le=95), min_payout: float = Query(settings.min_payout, ge=0, le=99), record: bool = True):
    if market != "otc":
        raise HTTPException(400, "Análise por corretora usa o book OTC próprio; mercado real é uma fonte separada.")
    b, s, venue = _venue_for(broker, session)
    try:
        frames, meta = await _frames(venue, symbol, s["key"])
        catalog = await _cached(f"s:{venue}", lambda: otcharts.symbols(venue, s["key"]))
        symbol_meta = next((x for x in catalog.get("symbols", []) if x.get("symbol") == symbol), {})
        for field in ("open", "payout", "isOtc"):
            if symbol_meta.get(field) is not None:
                meta[field] = symbol_meta.get(field)
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code, str(exc))
    if min(len(frames["1m"]), len(frames["5m"]), len(frames["1h"])) < 60:
        raise HTTPException(422, f"Histórico insuficiente para análise multitemporal: {{k: len(v) for k,v in frames.items()}}")
    resolve_from_candles(broker, symbol, frames["1m"])
    result = analyze_multiframe(frames, min_score=min_score)
    current = float(frames["1m"][-1]["close"])
    feed_age = _feed_age(frames["1m"])
    market_open = meta.get("open")
    payout = float(meta["payout"]) if meta.get("payout") is not None else None
    meta["payout"] = payout
    blocked = _blocked_quality(meta, feed_age, min_payout)
    if blocked:
        result["action"] = "WAIT"; result["quality"] = "SEM ENTRADA"; result["notes"] = blocked + result.get("notes", [])
    if payout is None:
        result["notes"] = ["Payout não disponível neste plano/feed; validação econômica indisponível"] + result.get("notes", [])
    cal = calibration_for(broker, market, result["confidence_score"])
    calibrated_probability = cal["posterior_probability"] if cal["ready"] else None
    breakeven = round(10000 / (100 + payout), 2) if payout and payout > 0 else None
    expected_value = None; edge_pp = None
    if calibrated_probability is not None and payout is not None:
        q = calibrated_probability / 100
        expected_value = round((q * (payout / 100) - (1 - q)) * 100, 2)
        edge_pp = round(calibrated_probability - breakeven, 2)
        if edge_pp < 2.0:
            result["action"] = "WAIT"; result["quality"] = "SEM ENTRADA"; result["notes"] = ["Probabilidade calibrada sem margem suficiente sobre o break-even"] + result.get("notes", [])
    now = int(time.time()); target_open = ((now // 60) + 1) * 60; recorded = False
    if record and result["action"] in {"CALL", "PUT"}:
        recorded = record_broker_signal(broker=broker, venue=venue, market=market, symbol=symbol, action=result["action"], score=result["confidence_score"], payout=payout, target_open_time=target_open, calibrated_probability=calibrated_probability)
    result.update({"version": VERSION, "broker": broker, "broker_name": b["name"], "venue": venue, "market": market, "symbol": symbol, "price": current, "provider": "OTCharts read-only", "market_open": market_open, "payout": payout, "breakeven_probability": breakeven, "economic_validation": "available" if payout is not None else "payout_unavailable", "feed_age_seconds": feed_age, "gaps": meta.get("gaps", {}), "target_open_time": target_open, "signal_recorded": recorded, "calibration": cal, "calibrated_probability": calibrated_probability, "expected_value_pct": expected_value, "edge_pp": edge_pp, "candles": {"1m": frames["1m"][-160:], "5m": frames["5m"][-160:], "1h": frames["1h"][-160:]}})
    return result

@app.get("/api/broker/scanner")
async def broker_scanner(broker: str, symbols: str, session: str, market: str = "otc", min_score: float = 66, min_payout: float = 80):
    requested = [x.strip() for x in symbols.split(",") if x.strip()][:10]
    if not requested: return {"rows": []}
    rows = []
    for sym in requested:
        try:
            item = await broker_analysis(broker, sym, session, market, min_score, min_payout, record=False)
            rows.append({k:item.get(k) for k in ["symbol","price","action","direction","confidence_score","quality","payout","breakeven_probability","calibrated_probability","edge_pp","market_open","feed_age_seconds"]})
        except HTTPException as exc:
            rows.append({"symbol": sym, "error": exc.detail, "action": "WAIT"})
    rows.sort(key=lambda x:(x.get("action") != "WAIT", x.get("calibrated_probability") or x.get("confidence_score") or 0), reverse=True)
    return {"broker": broker, "market": market, "rows": rows}

@app.post("/api/broker/resolve")
async def broker_resolve(broker: str, symbol: str, session: str):
    _, s, venue = _venue_for(broker, session)
    try: payload = await otcharts.candles(venue, symbol, 60, s["key"], 12)
    except otcharts.OTChartsError as exc: raise HTTPException(exc.status_code, str(exc))
    return {"ok": True, "resolved": resolve_from_candles(broker, symbol, payload.get("candles", []))}

@app.get("/api/history")
async def get_history(limit: int = 100, broker: str | None = None):
    return history(min(max(limit, 1), 500), broker)

@app.get("/api/calibration")
async def get_calibration(broker: str | None = None, market: str | None = None):
    return {"rows": calibration_table(broker, market), "min_samples_per_band": 50}

@app.get("/api/public/analysis")
async def public_analysis(symbol: str = "BTC/USD"):
    if symbol not in binance.SYMBOL_MAP: raise HTTPException(400, "Ativo público disponível: BTC/USD ou ETH/USD")
    try:
        c1,c5,c60 = await asyncio.gather(binance.fetch_candles(symbol,"1m",220), binance.fetch_candles(symbol,"5m",220), binance.fetch_candles(symbol,"1h",140))
    except Exception as exc: raise HTTPException(502, f"Feed público indisponível: {type(exc).__name__}")
    result = analyze_multiframe({"1m":c1,"5m":c5,"1h":c60}, min_score=66)
    return {"ok": True, "provider": "Binance public market data", "symbol": symbol, "price": c1[-1]["close"], "action": result["action"], "direction": result["direction"], "confidence_score": result["confidence_score"], "quality": result["quality"]}

@app.websocket("/ws/broker/{broker}/{symbol:path}")
async def broker_stream(ws: WebSocket, broker: str, symbol: str, session: str):
    await ws.accept()
    try:
        _, s, venue = _venue_for(broker, session)
        async for event in otcharts.stream_events(venue, [symbol], s["key"]): await ws.send_json(event)
    except WebSocketDisconnect: return
    except (otcharts.OTChartsError, HTTPException) as exc:
        try: await ws.send_json({"event":"error","data":{"status":getattr(exc,"status_code",500),"message":str(exc)}})
        except Exception: pass
    except Exception as exc:
        try: await ws.send_json({"event":"error","data":{"status":500,"message":type(exc).__name__}})
        except Exception: pass
