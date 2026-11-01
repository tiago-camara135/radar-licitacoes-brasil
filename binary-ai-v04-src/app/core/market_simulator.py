from __future__ import annotations
from datetime import datetime, timezone
from threading import RLock
import hashlib
import numpy as np

BASE = {
    "EUR/USD": 1.0875,
    "GBP/USD": 1.2730,
    "USD/JPY": 153.20,
    "AUD/USD": 0.6580,
    "BTC/USD": 68500.0,
    "ETH/USD": 3480.0,
}

VOL = {
    "EUR/USD": 0.00022,
    "GBP/USD": 0.00027,
    "USD/JPY": 0.00023,
    "AUD/USD": 0.00025,
    "BTC/USD": 0.0017,
    "ETH/USD": 0.0021,
}

class DemoMarket:
    def __init__(self):
        self.lock = RLock()
        self.series = {}
        self.current_minute = None
        self._rng = {}
        for symbol in BASE:
            seed = int(hashlib.sha256(symbol.encode()).hexdigest()[:8], 16)
            self._rng[symbol] = np.random.default_rng(seed)
            self.series[symbol] = self._generate_history(symbol, 9000)
        self.current_minute = int(datetime.now(tz=timezone.utc).timestamp() // 60)

    def _generate_history(self, symbol, n):
        rng = self._rng[symbol]
        price = BASE[symbol]
        vol = VOL[symbol]
        now_min = int(datetime.now(tz=timezone.utc).timestamp() // 60)
        candles = []
        regime = 0.0
        for i in range(n):
            if i % 90 == 0:
                regime = rng.normal(0, vol * 0.22)
            ret = regime + rng.normal(0, vol)
            o = price
            c = max(1e-8, o * (1 + ret))
            wick = abs(rng.normal(0, vol * 0.55))
            h = max(o, c) * (1 + wick)
            l = min(o, c) * (1 - wick)
            volume = float(abs(rng.normal(1000, 240)))
            candles.append({"time": (now_min - n + i) * 60, "open": o, "high": h, "low": l, "close": c, "volume": volume})
            price = c
        return candles

    def tick(self):
        with self.lock:
            minute = int(datetime.now(tz=timezone.utc).timestamp() // 60)
            for symbol, candles in self.series.items():
                rng = self._rng[symbol]
                last = candles[-1]
                if minute > self.current_minute:
                    o = last["close"]
                    candles.append({"time": minute * 60, "open": o, "high": o, "low": o, "close": o, "volume": 0.0})
                    if len(candles) > 12000:
                        del candles[:1000]
                    last = candles[-1]
                step = rng.normal(0, VOL[symbol] / 7.0)
                new_price = max(1e-8, last["close"] * (1 + step))
                last["close"] = float(new_price)
                last["high"] = float(max(last["high"], new_price))
                last["low"] = float(min(last["low"], new_price))
                last["volume"] += float(abs(rng.normal(12, 4)))
            self.current_minute = minute

    @staticmethod
    def _aggregate(candles, minutes):
        bucket = minutes * 60
        groups = {}
        for c in candles:
            key = (int(c["time"]) // bucket) * bucket
            g = groups.get(key)
            if not g:
                groups[key] = {"time": key, "open": c["open"], "high": c["high"], "low": c["low"], "close": c["close"], "volume": c.get("volume", 0)}
            else:
                g["high"] = max(g["high"], c["high"])
                g["low"] = min(g["low"], c["low"])
                g["close"] = c["close"]
                g["volume"] += c.get("volume", 0)
        return list(groups.values())

    def snapshot(self, symbol):
        with self.lock:
            one = [dict(x) for x in self.series[symbol]]
        return {
            "1m": one[-360:],
            "5m": self._aggregate(one, 5)[-260:],
            "1h": self._aggregate(one, 60)[-220:],
        }

    def price(self, symbol):
        with self.lock:
            return float(self.series[symbol][-1]["close"])
