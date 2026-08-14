from pydantic import BaseModel
from typing import Optional

class PlanResponse(BaseModel):
    name: str = "Free Trial"
    status: str = "active"
    price_monthly: float = 0.0
    renews_date: str = "—"
    conversations_included: int = 100
    conversations_used: int = 0
