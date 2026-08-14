from pydantic import BaseModel, Field
from typing import List, Dict, Any

class AnalyticsItem(BaseModel):
    label: str
    value: str
    change: str
    trend_up: bool

class DashboardAnalyticsResponse(BaseModel):
    conversations_today: int
    resolution_rate: float
    avg_response_time: float
    csat: float
    volume_trend: List[int] = Field(default_factory=list)
    csat_trend: List[float] = Field(default_factory=list)
    summary_items: List[AnalyticsItem] = Field(default_factory=list)
    has_real_data: bool = False
