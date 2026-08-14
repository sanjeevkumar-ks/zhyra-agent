"""
Credential Store
================
Centralized, encrypted credential management for all integration providers.

All credentials are encrypted with Fernet before being written to Firestore.
They are decrypted only immediately before use.
Credentials NEVER appear in API responses or logs.
"""

from app.database.firestore import firestore_client
from app.utils.encryption import encrypt_value, decrypt_value
from app.utils.logger import log_info, log_error
from typing import Dict, Any, Optional


# Separate Firestore collection for credentials (isolated from integration state)
CREDENTIALS_COLLECTION = "integration_credentials"


def _credential_doc_id(workspace_id: str, integration_id: str) -> str:
    """Returns the Firestore document ID for a workspace+integration credential pair."""
    return f"{workspace_id}__{integration_id}"


def save_credentials(workspace_id: str, integration_id: str, credentials: Dict[str, Any]) -> None:
    """
    Encrypt all credential values and persist them to Firestore.
    
    Args:
        workspace_id: Isolated workspace namespace
        integration_id: Provider identifier (e.g., 'int_gcal')
        credentials: Dict of raw credential values to encrypt and store
    """
    encrypted: Dict[str, Any] = {}
    for key, value in credentials.items():
        if isinstance(value, str) and value:
            encrypted[key] = encrypt_value(value)
        elif isinstance(value, dict):
            # Nested dict (e.g., service account JSON fields) — encrypt as JSON string
            import json
            encrypted[key] = encrypt_value(json.dumps(value))
        else:
            encrypted[key] = value  # Non-string values (booleans, ints) stored as-is

    doc_id = _credential_doc_id(workspace_id, integration_id)
    doc_ref = firestore_client.collection(CREDENTIALS_COLLECTION).document(doc_id)
    doc_ref.set({
        "workspace_id": workspace_id,
        "integration_id": integration_id,
        "credentials": encrypted
    }, merge=True)
    log_info(f"Credentials saved for integration {integration_id} (workspace: {workspace_id})")


def load_credentials(workspace_id: str, integration_id: str) -> Optional[Dict[str, Any]]:
    """
    Load and decrypt credentials for a workspace+integration pair.
    
    Returns:
        Decrypted credentials dict, or None if not found.
    """
    doc_id = _credential_doc_id(workspace_id, integration_id)
    doc_ref = firestore_client.collection(CREDENTIALS_COLLECTION).document(doc_id)
    snap = doc_ref.get()

    data = None
    if snap.exists:
        data = snap.to_dict()
    else:
        # Fallback stream query in case document ID formatting varies
        try:
            docs = firestore_client.collection(CREDENTIALS_COLLECTION).stream()
            for d in docs:
                ddata = d.to_dict()
                if ddata.get("workspace_id") == workspace_id and ddata.get("integration_id") == integration_id:
                    data = ddata
                    break
        except Exception as e:
            log_error(f"Fallback credential lookup failed for {integration_id}", exc=e)

    if not data:
        return None

    # Workspace isolation guard — never return credentials for wrong workspace
    if data.get("workspace_id") != workspace_id:
        log_error(f"Workspace isolation violation: requested {workspace_id} but doc belongs to {data.get('workspace_id')}")
        return None

    encrypted_creds = data.get("credentials", {})
    decrypted: Dict[str, Any] = {}
    for key, value in encrypted_creds.items():
        if isinstance(value, str) and value:
            decrypted[key] = decrypt_value(value)
        else:
            decrypted[key] = value

    return decrypted


def delete_credentials(workspace_id: str, integration_id: str) -> None:
    """
    Remove all stored credentials for a workspace+integration pair.
    Called during disconnect().
    """
    doc_id = _credential_doc_id(workspace_id, integration_id)
    doc_ref = firestore_client.collection(CREDENTIALS_COLLECTION).document(doc_id)
    doc_ref.delete()
    log_info(f"Credentials deleted for integration {integration_id} (workspace: {workspace_id})")


def credentials_exist(workspace_id: str, integration_id: str) -> bool:
    """Check if credentials are stored without loading them."""
    doc_id = _credential_doc_id(workspace_id, integration_id)
    doc_ref = firestore_client.collection(CREDENTIALS_COLLECTION).document(doc_id)
    snap = doc_ref.get()
    return snap.exists and snap.to_dict().get("workspace_id") == workspace_id
