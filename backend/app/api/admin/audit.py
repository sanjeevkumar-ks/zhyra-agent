import time
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

router = APIRouter()

def log_admin_audit(
    actor_uid: str,
    actor_email: str,
    action: str,
    target_uid: str = "",
    target_email: str = "",
    metadata: Optional[Dict[str, Any]] = None
):
    """
    Persists an administrative security audit log to Firestore.
    Never logs passwords or authorization tokens.
    """
    audit_id = f"aud_{uuid.uuid4().hex[:12]}"
    now = time.time()
    doc = {
        "id": audit_id,
        "actor_uid": actor_uid,
        "actor_email": actor_email.lower(),
        "action": action,
        "target_uid": target_uid,
        "target_email": target_email.lower() if target_email else "",
        "timestamp": now,
        "metadata": metadata or {}
    }
    try:
        firestore_client.collection("audit_logs").document(audit_id).set(doc)
        log_info(f"[ADMIN AUDIT] {actor_email} executed '{action}' on target '{target_email or target_uid}'")
    except Exception as e:
        log_error(f"Failed to record admin audit log: {e}", exc=e)

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    current_admin = None
):
    """
    Fetches recent security audit events from audit_logs collection.
    """
    try:
        docs = firestore_client.collection("audit_logs").stream()
        logs = []
        for snap in docs:
            d = snap.to_dict()
            if d:
                logs.append(d)
        
        # Sort descending by timestamp
        logs.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
        return {"logs": logs[:limit]}
    except Exception as e:
        log_error(f"Failed to retrieve audit logs: {e}", exc=e)
        raise HTTPException(status_code=500, detail="Unable to retrieve audit logs.")
