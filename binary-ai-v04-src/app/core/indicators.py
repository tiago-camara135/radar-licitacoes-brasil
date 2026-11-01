from __future__ import annotations
import numpy as np


def _arr(values):
    return np.asarray(values, dtype=float)


def sma(values, period: int):
    x = _arr(values)
    out = np.full_like(x, np.nan)
    if len(x) < period:
        return out
    kernel = np.ones(period) / period
    out[period - 1:] = np.convolve(x, kernel, mode="valid")
    return out


def ema(values, period: int):
    x = _arr(values)
    out = np.full_like(x, np.nan)
    if not len(x):
        return out
    alpha = 2.0 / (period + 1.0)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def rsi(values, period: int = 14):
    x = _arr(values)
    out = np.full_like(x, np.nan)
    if len(x) <= period:
        return out
    d = np.diff(x)
    gains = np.where(d > 0, d, 0.0)
    losses = np.where(d < 0, -d, 0.0)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])
    rs = avg_gain / avg_loss if avg_loss > 0 else np.inf
    out[period] = 100 - (100 / (1 + rs))
    for i in range(period + 1, len(x)):
        avg_gain = ((period - 1) * avg_gain + gains[i - 1]) / period
        avg_loss = ((period - 1) * avg_loss + losses[i - 1]) / period
        rs = avg_gain / avg_loss if avg_loss > 0 else np.inf
        out[i] = 100 - (100 / (1 + rs))
    return out


def macd(values, fast=12, slow=26, signal=9):
    x = _arr(values)
    line = ema(x, fast) - ema(x, slow)
    sig = ema(np.nan_to_num(line, nan=0.0), signal)
    hist = line - sig
    return line, sig, hist


def true_range(high, low, close):
    h, l, c = _arr(high), _arr(low), _arr(close)
    tr = np.zeros_like(c)
    tr[0] = h[0] - l[0]
    for i in range(1, len(c)):
        tr[i] = max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
    return tr


def atr(high, low, close, period=14):
    return ema(true_range(high, low, close), period)


def bollinger(values, period=20, std_mult=2.0):
    x = _arr(values)
    mid = sma(x, period)
    upper = np.full_like(x, np.nan)
    lower = np.full_like(x, np.nan)
    for i in range(period - 1, len(x)):
        s = np.std(x[i - period + 1:i + 1], ddof=0)
        upper[i] = mid[i] + std_mult * s
        lower[i] = mid[i] - std_mult * s
    return mid, upper, lower


def adx(high, low, close, period=14):
    h, l, c = _arr(high), _arr(low), _arr(close)
    if len(c) < period + 2:
        return np.full_like(c, np.nan)
    plus_dm = np.zeros_like(c)
    minus_dm = np.zeros_like(c)
    for i in range(1, len(c)):
        up = h[i] - h[i - 1]
        down = l[i - 1] - l[i]
        plus_dm[i] = up if up > down and up > 0 else 0.0
        minus_dm[i] = down if down > up and down > 0 else 0.0
    tr = true_range(h, l, c)
    atr_v = ema(tr, period)
    plus_di = 100 * ema(plus_dm, period) / np.where(atr_v == 0, np.nan, atr_v)
    minus_di = 100 * ema(minus_dm, period) / np.where(atr_v == 0, np.nan, atr_v)
    dx = 100 * np.abs(plus_di - minus_di) / np.where((plus_di + minus_di) == 0, np.nan, plus_di + minus_di)
    return ema(np.nan_to_num(dx, nan=0.0), period)


def stochastic(high, low, close, period=14):
    h, l, c = _arr(high), _arr(low), _arr(close)
    k = np.full_like(c, np.nan)
    for i in range(period - 1, len(c)):
        hh = np.max(h[i - period + 1:i + 1])
        ll = np.min(l[i - period + 1:i + 1])
        k[i] = 50.0 if hh == ll else 100 * (c[i] - ll) / (hh - ll)
    d = sma(np.nan_to_num(k, nan=50.0), 3)
    return k, d
