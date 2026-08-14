from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.billing_service import BillingService
from app.schemas.billing import PlanResponse

router = APIRouter()

@router.get("/plan", response_model=PlanResponse)
async def get_subscription_plan(workspace_id: str = Depends(get_user_workspace_id)):
    """Retrieves active subscription limit usage metrics."""
    return await BillingService.get_plan(workspace_id)
