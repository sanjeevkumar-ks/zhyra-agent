import time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from app.api.admin.guard import (
    get_current_admin_user,
    require_permission,
    AdminAuthUser,
    count_active_super_admins,
    ROLE_PERMISSIONS
)
from app.api.admin.audit import log_admin_audit

router = APIRouter()

@router.get("")
async def list_admin_users(
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Lists all administrator user accounts (Super Admin only).
    """
    try:
        docs = firestore_client.collection("admin_users").stream()
        users = []
        for snap in docs:
            d = snap.to_dict()
            if d:
                users.append(d)
        users.sort(key=lambda u: u.get("createdAt", 0), reverse=True)
        return {"users": users}
    except Exception as e:
        log_error(f"Failed to list admin users: {e}", exc=e)
        raise HTTPException(status_code=500, detail="Failed to fetch administrator accounts.")

@router.put("/{target_uid}/role")
async def update_admin_role(
    target_uid: str,
    payload: dict = Body(...),
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Updates an administrator's assigned role (Super Admin only).
    Enforces Last Super Admin Protection.
    """
    new_role = payload.get("role")
    if new_role not in ROLE_PERMISSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{new_role}'. Must be one of: {list(ROLE_PERMISSIONS.keys())}"
        )

    doc_ref = firestore_client.collection("admin_users").document(target_uid)
    snap = doc_ref.get()
    if not snap or not snap.exists:
        raise HTTPException(status_code=404, detail="Admin user not found.")

    target_data = snap.to_dict() or {}
    old_role = target_data.get("role", "")
    target_email = target_data.get("email", "")

    # Last Super Admin Protection check
    if old_role == "super_admin" and new_role != "super_admin":
        if count_active_super_admins() <= 1:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "LAST_SUPER_ADMIN_PROTECTED",
                        "message": "You cannot demote the last active Super Admin."
                    }
                }
            )

    doc_ref.update({
        "role": new_role,
        "updatedAt": time.time(),
        "updatedBy": current_admin.uid
    })

    log_admin_audit(
        actor_uid=current_admin.uid,
        actor_email=current_admin.email,
        action="admin_role_changed",
        target_uid=target_uid,
        target_email=target_email,
        metadata={"old_role": old_role, "new_role": new_role}
    )

    return {
        "success": True,
        "message": f"Updated role for {target_email} to {new_role}.",
        "user": {**target_data, "role": new_role}
    }

@router.put("/{target_uid}/status")
async def update_admin_status(
    target_uid: str,
    payload: dict = Body(...),
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Activates or deactivates an administrator account (Super Admin only).
    Enforces Last Super Admin Protection.
    """
    new_status = payload.get("status")
    if new_status not in ("active", "inactive"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'active' or 'inactive'.")

    doc_ref = firestore_client.collection("admin_users").document(target_uid)
    snap = doc_ref.get()
    if not snap or not snap.exists:
        raise HTTPException(status_code=404, detail="Admin user not found.")

    target_data = snap.to_dict() or {}
    target_role = target_data.get("role", "")
    target_email = target_data.get("email", "")

    # Last Super Admin Protection check
    if new_status == "inactive" and target_role == "super_admin":
        if count_active_super_admins() <= 1:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": {
                        "code": "LAST_SUPER_ADMIN_PROTECTED",
                        "message": "You cannot deactivate the last active Super Admin."
                    }
                }
            )

    doc_ref.update({
        "status": new_status,
        "updatedAt": time.time(),
        "updatedBy": current_admin.uid
    })

    action = "admin_deactivated" if new_status == "inactive" else "admin_reactivated"
    log_admin_audit(
        actor_uid=current_admin.uid,
        actor_email=current_admin.email,
        action=action,
        target_uid=target_uid,
        target_email=target_email,
        metadata={"new_status": new_status}
    )

    return {
        "success": True,
        "message": f"Admin account {target_email} is now {new_status}.",
        "user": {**target_data, "status": new_status}
    }
