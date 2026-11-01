from __future__ import annotations
import asyncio
import secrets
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.config import settings
from app.core.signal_engine import analyze_multiframe
from app.providers import otcharts
from app.db import init_db, record_broker_signal, resolve_from_candles, history, calibration_for, calibration_table, backend_name

app = FastAPI(title=settings.app_name, version="0.4.0")
ROOT = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

BROKERS = {
    "pocket": {"name": "Pocket Option", "venue": "otc", "status": "supported", "markets": ["otc"]},
    "quotex": {"name": "Quotex", "venue": "quotex", "status": "supported", "markets": ["otc", "real"]},
    "iqoption": {"name": "IQ Option", "venue": "iq", "status": "supported", "markets": ["otc", "real"]},
    "bullex": {"name": "Bullex", "venue": None, "status": "pending", "markets": ["otc", "real"]},
}

_sessions: dict[str, dict[str, Any]] = {}
_cache: dict[str, tuple[float, Any]] = {}
CACHE_SECONDS = 50
SESSION_TTL = 21600

class BrokerConnect(BaseModel):
    api_key: str


def _clean_sessions():
    now=time.time()
    for sid in list(_sessions):
        if _sessions[sid]["expires"] < now:
            _sessions.pop(sid, None)


def _session_key(session_id: str) -> str:
    _clean_sessions()
    row = _sessions.get(session_id)
    if not row:
        raise HTTPException(401, "Sessão Broker Feed ausente ou expirada")
    return row["key"]


def _broker(broker: str) -> dict:
    b = BROKERS.get(broker.lower())
    if not b:
        raise HTTPException(404, "Corretora não suportada")
    if b["status"] != "supported":
        raise HTTPException(501, "Conector Bullex ainda pendente de uma fonte de dados confiável")
    return b

async def _cached(key: str, fn):
    row = _cache.get(key)
    now = time.time()
    if row and now-row[0] < CACHE_SECONDS:
        return row[1]
    val = await fn()
    _cache[key]=(now,val)
    return val

async def _frames(venue: str, symbol: str, api_key: str) -> tuple[dict, dict]:
    async def load(tf, limit):
        ck=f"c:{venue}:{symbol}:{tf}"
        return await _cached(ck, lambda: otcharts.candles(venue,symbol,tf,api_key,limit))
    p1,p5,p60 = await asyncio.gather(load(60,360), load(300,300), load(3600,180))
    frames={"1m":p1["candles"],"5m":p5["candles"],"1h":p60["candles"]}
    meta={"open":p1.get("open"),"payout":p1.get("payout"),"isOtc":p1.get("isOtc"),"exhausted":p1.get("exhausted")}
    return frames,meta

@app.on_event("startup")
async def startup():
    init_db()

@app.get("/")
async def index():
    return FileResponse(ROOT / "static" / "index.html")

@app.get("/api/health")
async def health():
    return {"ok":True,"app":settings.app_name,"version":"0.4.0","mode":"broker-signal-engine","database":backend_name()}

@app.get("/api/brokers")
async def brokers():
    return {"brokers":BROKERS,"otcharts":{"venues":{"pocket":"otc","quotex":"quotex","iqoption":"iq"},"streaming":"plan-dependent"}}

@app.post("/api/broker/connect")
async def connect(body: BrokerConnect):
    key=body.api_key.strip()
    if not key:
        raise HTTPException(400,"Informe a OTCharts API Key")
    try:
        venue_data = await otcharts.venues(key)
        usage = await otcharts.usage(key)
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code, str(exc))
    sid=secrets.token_urlsafe(24)
    _sessions[sid]={"key":key,"expires":time.time()+SESSION_TTL}
    return {"ok":True,"session_id":sid,"expires_in":SESSION_TTL,"venues":venue_data.get("venues",[]),"usage":usage}

@app.get("/api/broker/symbols")
async def broker_symbols(broker: str, session: str, market: str="otc"):
    b=_broker(broker); key=_session_key(session); venue=b["venue"]
    try:
        payload=await _cached(f"s:{venue}", lambda: otcharts.symbols(venue,key))
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code,str(exc))
    rows=payload.get("symbols",[])
    if market == "otc": rows=[x for x in rows if x.get("isOtc") is not False]
    elif market == "real": rows=[x for x in rows if x.get("isOtc") is False]
    rows=sorted(rows,key=lambda x:(not bool(x.get("open",True)), x.get("name") or x.get("symbol")))
    return {"broker":broker,"venue":venue,"market":market,"count":len(rows),"symbols":rows}

@app.get("/api/broker/analysis")
async def broker_analysis(broker: str, symbol: str, session: str, market: str="otc",
                          min_score: float=Query(settings.signal_threshold, ge=55, le=95),
                          min_payout: float=Query(settings.min_payout, ge=0, le=99)):
    b=_broker(broker); key=_session_key(session); venue=b["venue"]
    try:
        frames, meta = await _frames(venue,symbol,key)
        catalog = await _cached(f"s:{venue}", lambda: otcharts.symbols(venue,key))
        symbol_meta = next((x for x in catalog.get("symbols",[]) if x.get("symbol") == symbol), {})
        for field in ("open", "payout", "isOtc"):
            if symbol_meta.get(field) is not None:
                meta[field] = symbol_meta.get(field)
    except otcharts.OTChartsError as exc:
        raise HTTPException(exc.status_code,str(exc))
    if min(len(frames["1m"]),len(frames["5m"]),len(frames["1h"])) < 60:
        raise HTTPException(422,"Histórico insuficiente para análise multitemporal")
    resolve_from_candles(broker,symbol,frames["1m"])
    result=analyze_multiframe(frames,min_score=min_score)
    current=float(frames["1m"][-1]["close"])
    last_candle_time=int(frames["1m"][-1]["time"])
    now=int(time.time())
    feed_age=max(0, now-(last_candle_time+60))
    market_open = meta.get("open")
    payout = meta.get("payout")
    if payout is not None:
        payout=float(payout)
    blocked=[]
    if market_open is False: blocked.append("Ativo fechado pela corretora")
    if feed_age > 150: blocked.append("Feed sem candle recente")
    if payout is not None and payout < min_payout: blocked.append(f"Payout abaixo do mínimo ({payout:.0f}% < {min_payout:.0f}%)")
    if blocked:
        result["action"]="WAIT"; result["quality"]="SEM ENTRADA"; result["notes"] = blocked + result.get("notes",[])

    cal=calibration_for(broker,market,result["confidence_score"])
    calibrated_probability=cal["posterior_probability"] if cal["ready"] else None
    breakeven = round(100/(100+payout)*100,2) if payout and payout>0 else None
    expected_value=None; edge_pp=None
    if calibrated_probability is not None and payout is not None:
        q=calibrated_probability/100
        expected_value=round((q*(payout/100) - (1-q))*100,2)
        edge_pp=round(calibrated_probability-breakeven,2)
        if edge_pp < 2.0:
            result["action"]="WAIT"; result["quality"]="SEM ENTRADA"; result["notes"]=["Probabilidade calibrada sem margem suficiente sobre o break-even"]+result.get("notes",[])

    target_open=((now//60)+1)*60
    recorded=False
    if result["action"] in {"CALL","PUT"}:
        recorded=record_broker_signal(
            broker=broker,venue=venue,market=market,symbol=symbol,action=result["action"],score=result["confidence_score"],
            payout=payout,target_open_time=target_open,calibrated_probability=calibrated_probability
        )

    result.update({
        "broker":broker,"broker_name":b["name"],"venue":venue,"market":market,"symbol":symbol,"price":current,
        "provider":"OTCharts read-only","market_open":market_open,"payout":payout,"breakeven_probability":breakeven,
        "feed_age_seconds":feed_age,"target_open_time":target_open,"signal_recorded":recorded,
        "calibration":cal,"calibrated_probability":calibrated_probability,"expected_value_pct":expected_value,"edge_pp":edge_pp,
        "candles":{"1m":frames["1m"][-160:],"5m":frames["5m"][-160:],"1h":frames["1h"][-160:]}
    })
    return result

@app.get("/api/broker/scanner")
async def broker_scanner(broker: str, symbols: str, session: str, market: str="otc", min_score: float=66, min_payout: float=80):
    requested=[s.strip() for s in symbols.split(",") if s.strip()][:10]
    if not requested: return {"rows":[]}
    rows=[]
    for sym in requested:
        try:
            item=await broker_analysis(broker,sym,session,market,min_score,min_payout)
            rows.append({k:item.get(k) for k in ["symbol","price","action","direction","confidence_score","quality","payout","breakeven_probability","calibrated_probability","edge_pp","market_open","feed_age_seconds"]})
        except HTTPException as exc:
            rows.append({"symbol":sym,"error":exc.detail,"action":"WAIT"})
    rows.sort(key=lambda x:(x.get("action")!="WAIT", x.get("calibrated_probability") or x.get("confidence_score") or 0),reverse=True)
    return {"broker":broker,"market":market,"rows":rows}

@app.get("/api/history")
async def get_history(limit:int=100, broker:str|None=None):
    return history(min(max(limit,1),500),broker)

@app.get("/api/calibration")
async def get_calibration(broker:str|None=None, market:str|None=None):
    return {"rows":calibration_table(broker,market),"min_samples_per_band":50}

@app.websocket("/ws/broker/{broker}/{symbol:path}")
async def broker_stream(ws:WebSocket, broker:str, symbol:str, session:str):
    await ws.accept()
    try:
        b=_broker(broker); key=_session_key(session); venue=b["venue"]
        async for ev in otcharts.stream_events(venue,[symbol],key):
            await ws.send_json(ev)
    except WebSocketDisconnect:
        return
    except (otcharts.OTChartsError, HTTPException) as exc:
        code=getattr(exc,"status_code",500)
        try: await ws.send_json({"event":"error","data":{"status":code,"message":str(exc)}})
        except Exception: pass
    except Exception as exc:
        try: await ws.send_json({"event":"error","data":{"status":500,"message":type(exc).__name__}})
        except Exception: pass
