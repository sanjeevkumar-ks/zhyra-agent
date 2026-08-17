import time
import uuid
from typing import List, Optional, Dict, Any
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class NotificationService:
    @staticmethod
    def create_notification(
        workspace_id: str,
        type: str,
        title: str,
        message: str,
        severity: str = "info",
        entity_type: Optional[str] = None,
        entity_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> dict:
        """Creates and stores a workspace notification in Firestore."""
        notif_id = f"notif_{uuid.uuid4().hex[:12]}"
        now = time.time()

        notif_doc = {
            "id": notif_id,
            "workspace_id": workspace_id,
            "type": type,
            "title": title,
            "message": message,
            "severity": severity,
            "entity_type": entity_type or "",
            "entity_id": entity_id or "",
            "metadata": metadata or {},
            "read": False,
            "created_at": now
        }

        try:
            firestore_client.collection("notifications").document(notif_id).set(notif_doc)
            log_info(f"Notification created [{notif_id}] for workspace {workspace_id}: {title}")
        except Exception as e:
            log_error(f"Failed to create notification for workspace {workspace_id}", exc=e)

        return notif_doc

    @staticmethod
    def get_notifications(workspace_id: str, unread_only: bool = False, limit: int = 30) -> List[dict]:
        """Fetches workspace notifications ordered by creation time descending."""
        try:
            stream = firestore_client.collection("notifications").stream()
            items = []
            for doc in stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    if unread_only and data.get("read", False):
                        continue
                    items.append(data)

            # Sort descending by timestamp
            items.sort(key=lambda x: x.get("created_at", 0), reverse=True)
            return items[:limit]
        except Exception as e:
            log_error(f"Failed to fetch notifications for workspace {workspace_id}", exc=e)
            return []

    @staticmethod
    def mark_as_read(workspace_id: str, notification_ids: Optional[List[str]] = None) -> dict:
        """Marks specified notifications (or all unread notifications) as read."""
        try:
            stream = firestore_client.collection("notifications").stream()
            updated_count = 0
            for doc in stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    notif_id = data.get("id")
                    if notification_ids is None or notif_id in notification_ids:
                        if not data.get("read", False):
                            firestore_client.collection("notifications").document(doc.id).update({"read": True})
                            updated_count += 1
            return {"success": True, "updated": updated_count}
        except Exception as e:
            log_error(f"Failed to mark notifications read for workspace {workspace_id}", exc=e)
            return {"success": False, "error": str(e)}
