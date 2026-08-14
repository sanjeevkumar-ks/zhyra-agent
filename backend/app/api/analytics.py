from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.analytics_service import AnalyticsService
from app.schemas.analytics import DashboardAnalyticsResponse
from typing import List, Dict, Any

router = APIRouter()

@router.get("/dashboard", response_model=DashboardAnalyticsResponse)
async def get_dashboard_analytics(workspace_id: str = Depends(get_user_workspace_id)):
    """Compiles deflection rates, average response delays, and trend charts."""
    return await AnalyticsService.get_dashboard_analytics(workspace_id)

@router.get("/activity", response_model=List[Dict[str, Any]])
async def get_activity_timeline(workspace_id: str = Depends(get_user_workspace_id)):
    """Retrieves list of latest actions executed across all AI agents."""
    return await AnalyticsService.get_recent_activity(workspace_id)
