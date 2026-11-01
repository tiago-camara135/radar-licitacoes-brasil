from __future__ import annotations
from dataclasses import dataclass
from typing import Dict, List
import numpy as np
from .indicators import ema, rsi, macd, atr, bollinger, adx, stochastic

@dataclass
class FrameResult:
    timeframe: str
    score: float
    trend: str
    strength: str
    rsi: float
    adx: float
    atr_pct: float
    reasons: List[str]


def _safe_last(arr, default=0.0):
    for v in arr[::-1]:
        if not np.isnan(v) and not np.isinf(v):
            return float(v)
    return default


def _pattern_score(candles: List[dict]) -> tuple[float, list[str]]:
    if len(candles) < 4:
        return 0.0, []
    o = np.array([float(c["open"]) for c in candles[-4:]])
    h = np.array([float(c["high"]) for c in candles[-4:]])
    l = np.array([float(c["low"]) for c in candles[-4:]])
    c = np.array([float(c["close"]) for c in candles[-4:]])
    score, reasons = 0.0, []

    prev_body = abs(c[-2] - o[-2])
    body = abs(c[-1] - o[-1])
    if c[-2] < o[-2] and c[-1] > o[-1] and c[-1] >= o[-2] and o[-1] <= c[-2] and body >= prev_body * 0.85:
        score += 10; reasons.append("Engolfo comprador")
    elif c[-2] > o[-2] and c[-1] < o[-1] and c[-1] <= o[-2] and o[-1] >= c[-2] and body >= prev_body * 0.85:
        score -= 10; reasons.append("Engolfo vendedor")

    rng = max(h[-1] - l[-1], 1e-12)
    upper = h[-1] - max(o[-1], c[-1])
    lower = min(o[-1], c[-1]) - l[-1]
    if lower / rng >= 0.48 and body / rng <= 0.45:
        score += 6; reasons.append("Rejeição inferior")
    if upper / rng >= 0.48 and body / rng <= 0.45:
        score -= 6; reasons.append("Rejeição superior")

    seq = np.diff(c)
    if len(seq) >= 3 and np.all(seq[-3:] > 0):
        score += 5; reasons.append("Sequência de fechamentos ascendentes")
    elif len(seq) >= 3 and np.all(seq[-3:] < 0):
        score -= 5; reasons.append("Sequência de fechamentos descendentes")
    return score, reasons


def _support_resistance(candles: List[dict], lookback: int = 40) -> dict:
    rows = candles[-lookback:]
    if not rows:
        return {"support": None, "resistance": None, "support_distance_pct": None, "resistance_distance_pct": None}
    last = float(rows[-1]["close"])
    lows = np.array([float(x["low"]) for x in rows])
    highs = np.array([float(x["high"]) for x in rows])
    support = float(np.percentile(lows, 12))
    resistance = float(np.percentile(highs, 88))
    return {
        "support": support,
        "resistance": resistance,
        "support_distance_pct": round(max(0.0, (last - support) / max(last, 1e-12) * 100), 4),
        "resistance_distance_pct": round(max(0.0, (resistance - last) / max(last, 1e-12) * 100), 4),
    }


def _frame_score(candles: List[dict], timeframe: str) -> FrameResult:
    close = np.array([float(c["close"]) for c in candles])
    high = np.array([float(c["high"]) for c in candles])
    low = np.array([float(c["low"]) for c in candles])
    open_ = np.array([float(c["open"]) for c in candles])
    if len(close) < 60:
        return FrameResult(timeframe, 0, "NEUTRO", "FRACA", 50, 0, 0, ["Histórico insuficiente"])

    e9, e21, e50 = ema(close, 9), ema(close, 21), ema(close, 50)
    r = rsi(close, 14)
    _, _, hist = macd(close)
    a = atr(high, low, close, 14)
    _, bb_u, bb_l = bollinger(close)
    ad = adx(high, low, close, 14)
    k, d = stochastic(high, low, close, 14)

    score = 0.0
    reasons = []
    c = close[-1]
    e9v, e21v, e50v = _safe_last(e9), _safe_last(e21), _safe_last(e50)
    rv, hv, adv = _safe_last(r, 50), _safe_last(hist), _safe_last(ad)
    kv, dv = _safe_last(k, 50), _safe_last(d, 50)
    av = _safe_last(a)
    atr_pct = (av / c * 100) if c else 0

    if e9v > e21v > e50v:
        score += 27; reasons.append("EMAs alinhadas para alta")
    elif e9v < e21v < e50v:
        score -= 27; reasons.append("EMAs alinhadas para baixa")
    else:
        score += 8 if e9v > e21v else -8
        reasons.append("EMAs parcialmente alinhadas")

    if 52 <= rv <= 72:
        score += 14; reasons.append(f"RSI comprador ({rv:.1f})")
    elif 28 <= rv <= 48:
        score -= 14; reasons.append(f"RSI vendedor ({rv:.1f})")
    elif rv > 78:
        score -= 5; reasons.append("RSI sobrecomprado")
    elif rv < 22:
        score += 5; reasons.append("RSI sobrevendido")

    if hv > 0:
        score += 13; reasons.append("MACD positivo")
    else:
        score -= 13; reasons.append("MACD negativo")

    recent = close[-8:]
    slope = (recent[-1] - recent[0]) / max(abs(recent[0]), 1e-9) * 100
    if slope > 0.04:
        score += 12; reasons.append("Momentum ascendente")
    elif slope < -0.04:
        score -= 12; reasons.append("Momentum descendente")

    if adv >= 25:
        score *= 1.12; reasons.append(f"ADX confirma força ({adv:.1f})")
    elif adv < 16:
        score *= 0.72; reasons.append(f"Mercado lateral (ADX {adv:.1f})")

    if kv > dv and kv < 82:
        score += 5
    elif kv < dv and kv > 18:
        score -= 5

    bu, bl = _safe_last(bb_u, c), _safe_last(bb_l, c)
    if c > bu:
        score -= 3; reasons.append("Preço acima da Bollinger")
    elif c < bl:
        score += 3; reasons.append("Preço abaixo da Bollinger")

    body = close[-1] - open_[-1]
    rng = max(high[-1] - low[-1], 1e-9)
    if abs(body) / rng > 0.65:
        score += 6 if body > 0 else -6
        reasons.append("Candle de impulso")

    pscore, preasons = _pattern_score(candles)
    score += pscore
    reasons.extend(preasons)

    score = float(max(-100, min(100, score)))
    trend = "ALTA" if score > 14 else "BAIXA" if score < -14 else "NEUTRO"
    strength = "FORTE" if abs(score) >= 58 else "MODERADA" if abs(score) >= 32 else "FRACA"
    return FrameResult(timeframe, score, trend, strength, rv, adv, atr_pct, reasons[:7])


def analyze_multiframe(frames: Dict[str, List[dict]], min_score: float = 66.0) -> dict:
    r1h = _frame_score(frames["1h"], "1H")
    r5m = _frame_score(frames["5m"], "5M")
    r1m = _frame_score(frames["1m"], "1M")

    raw = 0.42 * r1h.score + 0.35 * r5m.score + 0.23 * r1m.score
    aligned = (r1h.score > 15 and r5m.score > 12 and r1m.score > 8) or (r1h.score < -15 and r5m.score < -12 and r1m.score < -8)
    conflict = np.sign(r1h.score) != np.sign(r5m.score) and abs(r1h.score) > 20 and abs(r5m.score) > 20
    notes = []
    if aligned:
        raw *= 1.12; notes.append("Confluência 1H + 5M + 1M")
    if conflict:
        raw *= 0.55; notes.append("Conflito entre 1H e 5M")

    avg_adx = (r1h.adx + r5m.adx + r1m.adx) / 3
    if avg_adx < 15:
        raw *= 0.76; notes.append("Força direcional baixa")

    sr = _support_resistance(frames["1m"])
    last_atr = r1m.atr_pct
    danger = max(last_atr * 0.8, 0.015)
    preliminary_dir = "ALTA" if raw > 8 else "BAIXA" if raw < -8 else "AGUARDAR"
    blocked_by_level = False
    if preliminary_dir == "ALTA" and sr["resistance_distance_pct"] is not None and sr["resistance_distance_pct"] < danger:
        raw *= 0.70; blocked_by_level = True; notes.append("Resistência muito próxima")
    if preliminary_dir == "BAIXA" and sr["support_distance_pct"] is not None and sr["support_distance_pct"] < danger:
        raw *= 0.70; blocked_by_level = True; notes.append("Suporte muito próximo")

    direction = "ALTA" if raw > 8 else "BAIXA" if raw < -8 else "AGUARDAR"
    confidence = 50 + min(43, abs(raw) * 0.48)
    if direction == "AGUARDAR":
        confidence = min(confidence, 59)
    confidence = round(float(confidence), 1)

    action = "CALL" if direction == "ALTA" and confidence >= min_score else "PUT" if direction == "BAIXA" and confidence >= min_score else "WAIT"
    quality = "MUITO FORTE" if confidence >= 80 and aligned else "FORTE" if confidence >= 72 else "MODERADA" if confidence >= min_score else "SEM ENTRADA"
    if blocked_by_level and confidence < 76:
        action = "WAIT"; quality = "SEM ENTRADA"

    return {
        "direction": direction,
        "action": action,
        "confidence_score": confidence,
        "confidence_kind": "score_tecnico_nao_calibrado",
        "quality": quality,
        "expiry_seconds": 60,
        "aligned": aligned,
        "notes": notes,
        "support_resistance": sr,
        "frames": {"1h": r1h.__dict__, "5m": r5m.__dict__, "1m": r1m.__dict__},
    }
