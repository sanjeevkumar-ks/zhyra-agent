import os
import time
from typing import List, Optional
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.database.firestore import firestore_client
from app.utils.logger import log_error, log_info
from app.api.admin.audit import log_admin_audit

security_scheme = HTTPBearer(auto_error=False)

# Bootstrap Configuration
INITIAL_ADMIN_EMAIL = os.getenv("INITIAL_ADMIN_EMAIL", "sanjeevsiva80@gmail.com").strip().lower()

# Role to Permission mapping
ROLE_PERMISSIONS = {
    "super_admin": [
        "*"
    ],
    "support_admin": [
        "users.read",
        "workspaces.read",
        "conversations.read",
        "issues.read",
        "issues.update",
        "activity.read"
    ],
    "operations_admin": [
        "agents.read",
        "integrations.read",
        "issues.read",
        "issues.update",
        "health.read",
        "activity.read"
    ]
}

class AdminAuthUser:
    def __init__(
        self,
        uid: str,
        email: str,
        displayName: str,
        role: str,
        status: str,
        permissions: List[str]
    ):
        self.uid = uid
        self.email = email
        self.displayName = displayName
        self.role = role
        self.status = status
        self.permissions = permissions

    def has_permission(self, perm: str) -> bool:
        if "*" in self.permissions:
            return True
        return perm in self.permissions

    def to_dict(self) -> dict:
        return {
            "uid": self.uid,
            "email": self.email,
            "displayName": self.displayName,
            "role": self.role,
            "status": self.status,
            "permissions": self.permissions
        }

def count_active_super_admins() -> int:
    """Helper to count total active Super Admins in Firestore."""
    try:
        docs = firestore_client.collection("admin_users").stream()
        count = 0
        for d in docs:
            data = d.to_dict() or {}
            if data.get("role") == "super_admin" and data.get("status") == "active":
                count += 1
        return count
    except Exception as e:
        log_error(f"Error counting super admins: {e}", exc=e)
        return 1  # Safe fallback

async def get_current_admin_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> AdminAuthUser:
    """
    Verifies Firebase ID token, resolves admin_users identity, or executes
    idempotent first-time bootstrap / invitation acceptance.
    """
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization Header. Please provide a Bearer Firebase ID token."
        )

    token = credentials.credentials
    try:
        import firebase_admin
        from firebase_admin import auth
        
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        email = (decoded_token.get("email") or "").strip().lower()
        email_verified = decoded_token.get("email_verified", False)
        display_name = decoded_token.get("name") or (email.split("@")[0] if email else "Admin")
        firebase_sign_in_provider = decoded_token.get("firebase", {}).get("sign_in_provider", "")

        if not uid or not email:
            raise HTTPException(status_code=401, detail="Invalid token payload: missing uid or email.")

        # 1. Check existing admin record in Firestore
        admin_ref = firestore_client.collection("admin_users").document(uid)
        snap = admin_ref.get()

        if snap and snap.exists:
            admin_data = snap.to_dict() or {}
            status = admin_data.get("status", "active")
            role = admin_data.get("role", "support_admin")

            if status != "active":
                log_admin_audit(
                    actor_uid=uid,
                    actor_email=email,
                    action="admin_access_denied",
                    target_uid=uid,
                    target_email=email,
                    metadata={"reason": "Account is inactive"}
                )
                raise HTTPException(
                    status_code=403,
                    detail={
                        "authenticated": True,
                        "is_admin": False,
                        "error": {
                            "code": "ADMIN_ACCESS_DENIED",
                            "message": "Your administrator account has been deactivated."
                        }
                    }
                )

            # Update lastLoginAt
            try:
                admin_ref.update({"lastLoginAt": time.time()})
            except Exception:
                pass

            perms = ROLE_PERMISSIONS.get(role, [])
            return AdminAuthUser(
                uid=uid,
                email=email,
                displayName=admin_data.get("displayName") or display_name,
                role=role,
                status=status,
                permissions=perms
            )

        # 2. Check for Initial Bootstrap
        if INITIAL_ADMIN_EMAIL and email == INITIAL_ADMIN_EMAIL:
            # Require email verification if password-based provider
            if firebase_sign_in_provider == "password" and not email_verified:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "authenticated": True,
                        "is_admin": False,
                        "error": {
                            "code": "EMAIL_NOT_VERIFIED",
                            "message": "Your email address must be verified before bootstrapping administrator access."
                        }
                    }
                )

            now = time.time()
            bootstrap_doc = {
                "uid": uid,
                "email": email,
                "displayName": display_name,
                "role": "super_admin",
                "status": "active",
                "createdAt": now,
                "createdBy": "bootstrap",
                "lastLoginAt": now
            }
            admin_ref.set(bootstrap_doc)
            log_admin_audit(
                actor_uid=uid,
                actor_email=email,
                action="admin_bootstrapped",
                target_uid=uid,
                target_email=email,
                metadata={"role": "super_admin"}
            )
            log_info(f"[BOOTSTRAP] Successfully initialized first Super Admin: {email} ({uid})")

            return AdminAuthUser(
                uid=uid,
                email=email,
                displayName=display_name,
                role="super_admin",
                status="active",
                permissions=ROLE_PERMISSIONS["super_admin"]
            )

        # 3. Check for Pending Invitation Acceptance
        invites_coll = firestore_client.collection("admin_invites")
        invites = invites_coll.stream()
        matching_invite = None
        matching_invite_id = None

        for inv in invites:
            data = inv.to_dict() or {}
            if data.get("email", "").lower() == email and data.get("status") == "pending":
                if data.get("expiresAt", 0) > time.time():
                    matching_invite = data
                    matching_invite_id = inv.id
                    break

        if matching_invite:
            if firebase_sign_in_provider == "password" and not email_verified:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "authenticated": True,
                        "is_admin": False,
                        "error": {
                            "code": "EMAIL_NOT_VERIFIED",
                            "message": "Your email address must be verified before accepting your administrator invitation."
                        }
                    }
                )

            now = time.time()
            role = matching_invite.get("role", "support_admin")
            new_admin_doc = {
                "uid": uid,
                "email": email,
                "displayName": display_name,
                "role": role,
                "status": "active",
                "createdAt": now,
                "createdBy": matching_invite.get("createdBy", "system"),
                "lastLoginAt": now
            }
            admin_ref.set(new_admin_doc)

            # Update invite record
            invites_coll.document(matching_invite_id).update({
                "status": "accepted",
                "acceptedAt": now,
                "acceptedUid": uid
            })

            log_admin_audit(
                actor_uid=uid,
                actor_email=email,
                action="admin_invite_accepted",
                target_uid=uid,
                target_email=email,
                metadata={"role": role, "invite_id": matching_invite_id}
            )
            log_info(f"[INVITE ACCEPTED] Admin {email} accepted invitation for role '{role}'")

            return AdminAuthUser(
                uid=uid,
                email=email,
                displayName=display_name,
                role=role,
                status="active",
                permissions=ROLE_PERMISSIONS.get(role, [])
            )

        # 4. Unauthorized
        log_admin_audit(
            actor_uid=uid,
            actor_email=email,
            action="admin_access_denied",
            target_uid=uid,
            target_email=email,
            metadata={"reason": "No admin record or valid invitation found"}
        )
        raise HTTPException(
            status_code=403,
            detail={
                "authenticated": True,
                "is_admin": False,
                "error": {
                    "code": "ADMIN_ACCESS_DENIED",
                    "message": "You do not have access to the Zhyra Admin Console."
                }
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        log_error(f"Admin Token Verification Exception: {e}", exc=e)
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired Firebase ID token: {str(e)}"
        )

def require_permission(required_permission: str):
    """Dependency generator enforcing granular admin permissions."""
    async def permission_checker(admin: AdminAuthUser = Depends(get_current_admin_user)) -> AdminAuthUser:
        if not admin.has_permission(required_permission):
            raise HTTPException(
                status_code=403,
                detail={
                    "error": {
                        "code": "PERMISSION_DENIED",
                        "message": f"Action requires permission '{required_permission}' which is not granted to role '{admin.role}'."
                    }
                }
            )
        return admin
    return permission_checker
