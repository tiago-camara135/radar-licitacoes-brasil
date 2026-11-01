from __future__ import annotations
import os
from dataclasses import dataclass
from dotenv import load_dotenv
load_dotenv()

@dataclass
class Settings:
    app_name: str = os.getenv("APP_NAME", "Binary AI Lab")
    market_data_mode: str = os.getenv("MARKET_DATA_MODE", "live")
    twelve_data_api_key: str = os.getenv("TWELVE_DATA_API_KEY", "")
    signal_threshold: float = float(os.getenv("SIGNAL_THRESHOLD", "66"))
    min_payout: float = float(os.getenv("MIN_PAYOUT", "80"))

settings = Settings()
