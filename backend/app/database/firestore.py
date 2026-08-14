import os
import json
from typing import Any, Dict, List, Optional
from app.utils.logger import log_info, log_error

class MockDocumentSnapshot:
    def __init__(self, doc_id: str, data: Optional[Dict[str, Any]]):
        self.id = doc_id
        self._data = data
        self.exists = data is not None

    def to_dict(self) -> Dict[str, Any]:
        return self._data or {}

class MockDocumentReference:
    def __init__(self, collection_name: str, doc_id: str, client: 'MockFirestoreClient'):
        self.id = doc_id
        self.collection_name = collection_name
        self.client = client

    def get(self) -> MockDocumentSnapshot:
        data = self.client._read_doc(self.collection_name, self.id)
        return MockDocumentSnapshot(self.id, data)

    def set(self, data: Dict[str, Any], merge: bool = True) -> None:
        self.client._write_doc(self.collection_name, self.id, data, merge=merge)

    def update(self, data: Dict[str, Any]) -> None:
        self.client._write_doc(self.collection_name, self.id, data, merge=True)

    def delete(self) -> None:
        self.client._delete_doc(self.collection_name, self.id)

class MockCollectionReference:
    def __init__(self, collection_name: str, client: 'MockFirestoreClient'):
        self.name = collection_name
        self.client = client

    def document(self, doc_id: str) -> MockDocumentReference:
        return MockDocumentReference(self.name, doc_id, self.client)

    def stream(self) -> List[MockDocumentSnapshot]:
        docs = self.client._list_collection(self.name)
        return [MockDocumentSnapshot(k, v) for k, v in docs.items()]

    def add(self, data: Dict[str, Any]) -> MockDocumentReference:
        import uuid
        doc_id = f"{self.name[:3]}_{uuid.uuid4().hex[:8]}"
        self.client._write_doc(self.name, doc_id, data, merge=False)
        return MockDocumentReference(self.name, doc_id, self.client)

class MockFirestoreClient:
    def __init__(self, file_path: str = "mock_db.json"):
        self.file_path = file_path
        self._db = {}
        self._load()

    def _load(self):
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r") as f:
                    self._db = json.load(f)
            except Exception as e:
                log_error("Failed to load mock firestore database file, starting fresh", exc=e)
                self._db = {}
        else:
            self._db = {}

    def _save(self):
        try:
            with open(self.file_path, "w") as f:
                json.dump(self._db, f, indent=2)
        except Exception as e:
            log_error("Failed to save mock firestore database file", exc=e)

    def collection(self, name: str) -> MockCollectionReference:
        return MockCollectionReference(name, self)

    def _read_doc(self, coll: str, doc_id: str) -> Optional[Dict[str, Any]]:
        return self._db.get(coll, {}).get(doc_id)

    def _write_doc(self, coll: str, doc_id: str, data: Dict[str, Any], merge: bool = True):
        if coll not in self._db:
            self._db[coll] = {}
        
        if merge and doc_id in self._db[coll]:
            self._db[coll][doc_id].update(data)
        else:
            self._db[coll][doc_id] = data
        self._save()

    def _delete_doc(self, coll: str, doc_id: str):
        if coll in self._db and doc_id in self._db[coll]:
            del self._db[coll][doc_id]
            self._save()

    def _list_collection(self, coll: str) -> Dict[str, Dict[str, Any]]:
        return self._db.get(coll, {})

# Initialize the firestore client
firestore_client = None
is_mock = True

firebase_creds_path = os.getenv("FIREBASE_CREDENTIALS_JSON_PATH")

if firebase_creds_path and os.path.exists(firebase_creds_path):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
        
        # Initialize Firebase App if not already initialized
        if not firebase_admin._apps:
            cred = credentials.Certificate(firebase_creds_path)
            firebase_admin.initialize_app(cred)
        
        firestore_client = firestore.client()
        is_mock = False
        log_info("Firestore client initialized successfully using Firebase credentials.")
    except Exception as e:
        log_error("Failed to initialize Firebase Admin SDK with credentials. Falling back to mock Firestore.", exc=e)

if firestore_client is None:
    # Use mock db
    firestore_client = MockFirestoreClient()
    log_info("Mock Firestore database loaded (fallback mode). Working file: mock_db.json")

def get_db():
    """Dependency injection helper for database operations."""
    return firestore_client
