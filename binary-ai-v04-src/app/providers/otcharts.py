from __future__ import annotations

import json
from typing import AsyncIterator
import httpx

BASE_URL = "https://otcharts.com"

class OTChartsError(RuntimeError):
    def __init__(self, status_code: int, message: str, payload=None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}

async def _get(path: str, api_key: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        r = await client.get(f"{BASE_URL}{path}", headers=_headers(api_key), params=params)
    try:
        payload = r.json()
    except Exception:
        payload = {"detail": r.text[:500]}
    if r.status_code >= 400:
        msg = payload.get("detail") or payload.get("error") or payload.get("message") or f"OTCharts HTTP {r.status_code}"
        raise OTChartsError(r.status_code, str(msg), payload)
    return payload

async def venues(api_key: str) -> dict:
    return await _get("/v1/venues", api_key)

async def usage(api_key: str) -> dict:
    try:
        return await _get("/v1/usage", api_key)
    except OTChartsError as exc:
        if exc.status_code == 404:
            return {}
        raise

async def symbols(venue: str, api_key: str) -> dict:
    return await _get("/v1/symbols", api_key, {"venue": venue})

async def candles(venue: str, symbol: str, tf_seconds: int, api_key: str, limit: int = 300) -> dict:
    payload = await _get(
        "/v1/candles",
        api_key,
        {"venue": venue, "symbol": symbol, "tf": int(tf_seconds), "limit": int(limit)},
    )
    rows = payload.get("candles") or []
    payload["candles"] = [
        {
            "time": int(c["time"]),
            "open": float(c["open"]),
            "high": float(c["high"]),
            "low": float(c["low"]),
            "close": float(c["close"]),
        }
        for c in rows
        if all(k in c for k in ("time", "open", "high", "low", "close"))
    ]
    payload["candles"].sort(key=lambda x: x["time"])
    return payload

async def stream_events(venue: str, symbols_list: list[str], api_key: str) -> AsyncIterator[dict]:
    if not symbols_list:
        return
    params = {"venue": venue, "symbol": ",".join(symbols_list)}
    timeout = httpx.Timeout(connect=15.0, read=None, write=15.0, pool=15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", f"{BASE_URL}/v1/stream", headers=_headers(api_key), params=params) as r:
            if r.status_code >= 400:
                raw = await r.aread()
                try:
                    payload = json.loads(raw.decode("utf-8"))
                except Exception:
                    payload = {"detail": raw.decode("utf-8", errors="replace")[:500]}
                msg = payload.get("detail") or payload.get("error") or payload.get("message") or f"OTCharts HTTP {r.status_code}"
                raise OTChartsError(r.status_code, str(msg), payload)

            event_name = "message"
            data_lines: list[str] = []
            async for line in r.aiter_lines():
                if line == "":
                    if data_lines:
                        raw_data = "\n".join(data_lines)
                        try:
                            data = json.loads(raw_data)
                        except Exception:
                            data = {"raw": raw_data}
                        yield {"event": event_name, "data": data}
                    event_name = "message"
                    data_lines = []
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("event:"):
                    event_name = line[6:].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[5:].strip())
