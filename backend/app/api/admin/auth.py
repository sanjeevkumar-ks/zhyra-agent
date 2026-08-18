from fastapi import APIRouter, Depends
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.api.admin.audit import log_admin_audit

router = APIRouter()

@router.get("/me")
async def get_admin_me(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns current authenticated administrator profile and permission set.
    Executes idempotent bootstrap or invitation check during user lookup.
    """
    # Log successful admin authentication
    log_admin_audit(
        actor_uid=current_admin.uid,
        actor_email=current_admin.email,
        action="admin_login",
        target_uid=current_admin.uid,
        target_email=current_admin.email,
        metadata={"role": current_admin.role}
    )

    return {
        "authenticated": True,
        "is_admin": True,
        "admin": {
            "uid": current_admin.uid,
            "email": current_admin.email,
            "displayName": current_admin.displayName,
            "role": current_admin.role,
            "status": current_admin.status
        },
        "permissions": current_admin.permissions
    }
