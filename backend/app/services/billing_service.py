from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info

class BillingService:
    @staticmethod
    async def get_plan(workspace_id: str) -> dict:
        """Retrieves subscription state and conversation metrics."""
        doc_ref = firestore_client.collection("plans").document(workspace_id)
        snap = doc_ref.get()
        if not snap.exists:
            # Provision default Free Trial plan if missing
            default_plan = {
                "name": "Scale Plan (Trial)",
                "status": "active",
                "price_monthly": 899.0,
                "renews_date": "Sept 14",
                "conversations_included": 20000,
                "conversations_used": 12400
            }
            doc_ref.set(default_plan)
            return default_plan
            
        return snap.to_dict()

    @staticmethod
    async def increment_usage(workspace_id: str) -> None:
        """Increments conversation counter."""
        doc_ref = firestore_client.collection("plans").document(workspace_id)
        snap = doc_ref.get()
        if snap.exists:
            data = snap.to_dict()
            used = data.get("conversations_used", 0) + 1
            doc_ref.update({"conversations_used": used})
