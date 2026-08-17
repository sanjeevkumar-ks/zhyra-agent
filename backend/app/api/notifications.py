from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from app.middleware.auth import get_current_user
from app.api.workspaces import get_user_workspace_id
from app.services.notification_service import NotificationService

router = APIRouter()

@router.get("")
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(30),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Retrieves real notifications for the authenticated user's workspace."""
    return NotificationService.get_notifications(workspace_id, unread_only=unread_only, limit=limit)

@router.post("/read")
async def mark_notifications_read(
    payload: dict = {},
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Marks specified notification IDs or all notifications as read."""
    notification_ids = payload.get("notification_ids")
    return NotificationService.mark_as_read(workspace_id, notification_ids)
