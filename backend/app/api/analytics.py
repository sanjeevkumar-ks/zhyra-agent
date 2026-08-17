from fastapi import APIRouter, Depends, Query
from app.middleware.auth import get_current_user
from app.api.workspaces import get_user_workspace_id
from app.services.analytics_service import AnalyticsService
from typing import List, Dict, Any, Optional

router = APIRouter()

@router.get("/overview")
@router.get("/dashboard")
async def get_analytics_overview(
    range: str = Query("30d"),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Returns workspace-scoped real analytics overview and time-range metric comparisons."""
    return await AnalyticsService.get_dashboard_analytics(workspace_id, range_key=range)

@router.get("/timeseries")
async def get_analytics_timeseries(
    range: str = Query("30d"),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Returns real date-bucketed analytics timeseries for chart rendering."""
    res = await AnalyticsService.get_dashboard_analytics(workspace_id, range_key=range)
    return {"range": range, "timeseries": res.get("timeseries", [])}

@router.get("/activity", response_model=List[Dict[str, Any]])
async def get_activity_timeline(workspace_id: str = Depends(get_user_workspace_id)):
    """Retrieves list of latest actions executed across all AI agents."""
    return await AnalyticsService.get_recent_activity(workspace_id)
