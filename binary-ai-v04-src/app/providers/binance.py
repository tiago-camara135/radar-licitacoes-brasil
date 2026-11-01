from __future__ import annotations
import httpx
import websockets
import json

SYMBOL_MAP = {"BTC/USD": "BTCUSDT", "ETH/USD": "ETHUSDT"}
INTERVAL_MAP = {"1m": "1m", "5m": "5m", "1h": "1h"}

async def fetch_candles(symbol: str, timeframe: str, limit: int = 250):
    s = SYMBOL_MAP[symbol]
    interval = INTERVAL_MAP[timeframe]
    url = "https://api.binance.com/api/v3/klines"
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(url, params={"symbol": s, "interval": interval, "limit": min(limit, 1000)})
        r.raise_for_status()
        rows = r.json()
    return [{"time": int(x[0] // 1000), "open": float(x[1]), "high": float(x[2]), "low": float(x[3]), "close": float(x[4]), "volume": float(x[5])} for x in rows]

async def relay_stream(symbol: str, client_ws):
    s = SYMBOL_MAP[symbol].lower()
    streams = f"{s}@kline_1m/{s}@kline_5m/{s}@kline_1h"
    url = f"wss://stream.binance.com:9443/stream?streams={streams}"
    async with websockets.connect(url, ping_interval=20, ping_timeout=20) as upstream:
        async for raw in upstream:
            msg = json.loads(raw)
            data = msg.get("data", {})
            k = data.get("k", {})
            if not k:
                continue
            await client_ws.send_json({
                "type": "kline",
                "provider": "Binance",
                "symbol": symbol,
                "timeframe": k.get("i"),
                "time": int(k.get("t", 0) / 1000),
                "open": float(k.get("o", 0)),
                "high": float(k.get("h", 0)),
                "low": float(k.get("l", 0)),
                "close": float(k.get("c", 0)),
                "closed": bool(k.get("x")),
            })
