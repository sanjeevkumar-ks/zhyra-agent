import time
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from app.api.admin.guard import (
    get_current_admin_user,
    require_permission,
    AdminAuthUser,
    ROLE_PERMISSIONS
)
from app.api.admin.audit import log_admin_audit

router = APIRouter()

@router.post("")
async def create_admin_invite(
    payload: dict = Body(...),
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Creates an invitation for a new administrator (Super Admin only).
    """
    email = (payload.get("email") or "").strip().lower()
    role = payload.get("role")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid target email address is required.")

    if role not in ROLE_PERMISSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role '{role}'. Must be one of: {list(ROLE_PERMISSIONS.keys())}"
        )

    # 1. Check if user is already an admin
    docs = firestore_client.collection("admin_users").stream()
    for d in docs:
        if d.to_dict().get("email", "").lower() == email:
            raise HTTPException(
                status_code=400,
                detail=f"User '{email}' is already an administrator account."
            )

    # 2. Create Invite Record
    invite_id = f"inv_{uuid.uuid4().hex[:12]}"
    now = time.time()
    expires_at = now + (86400 * 7)  # 7 days valid

    invite_doc = {
        "id": invite_id,
        "email": email,
        "role": role,
        "status": "pending",
        "createdBy": current_admin.uid,
        "creatorEmail": current_admin.email,
        "createdAt": now,
        "expiresAt": expires_at
    }

    firestore_client.collection("admin_invites").document(invite_id).set(invite_doc)

    log_admin_audit(
        actor_uid=current_admin.uid,
        actor_email=current_admin.email,
        action="admin_invited",
        target_email=email,
        metadata={"role": role, "invite_id": invite_id}
    )

    return {
        "success": True,
        "message": f"Invitation created for {email} with role '{role}'.",
        "invite": invite_doc
    }

@router.get("")
async def list_admin_invites(
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Lists all administrator invitations (Super Admin only).
    """
    try:
        docs = firestore_client.collection("admin_invites").stream()
        invites = []
        for snap in docs:
            d = snap.to_dict()
            if d:
                invites.append(d)
        invites.sort(key=lambda i: i.get("createdAt", 0), reverse=True)
        return {"invites": invites}
    except Exception as e:
        log_error(f"Failed to list admin invites: {e}", exc=e)
        raise HTTPException(status_code=500, detail="Failed to fetch admin invitations.")

@router.delete("/{invite_id}")
async def revoke_admin_invite(
    invite_id: str,
    current_admin: AdminAuthUser = Depends(require_permission("*"))
):
    """
    Revokes a pending administrator invitation (Super Admin only).
    """
    ref = firestore_client.collection("admin_invites").document(invite_id)
    snap = ref.get()
    if not snap or not snap.exists:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    invite_data = snap.to_dict() or {}
    ref.update({"status": "revoked", "revokedAt": time.time(), "revokedBy": current_admin.uid})

    log_admin_audit(
        actor_uid=current_admin.uid,
        actor_email=current_admin.email,
        action="admin_invite_revoked",
        target_email=invite_data.get("email", ""),
        metadata={"invite_id": invite_id}
    )

    return {"success": True, "message": "Invitation revoked."}
