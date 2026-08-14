from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info, log_error
import uuid

class VoiceService:
    @staticmethod
    async def list_voices(workspace_id: str) -> list:
        # Predefined voice library presets
        presets = [
            {
                "id": "voc_lib_emma",
                "workspace_id": workspace_id,
                "name": "Emma",
                "provider": "ElevenLabs",
                "gender": "Female",
                "description": "Professional, warm, great for customer support.",
                "preview_url": "/api/static/previews/emma_preview.mp3",
                "status": "ready",
                "is_custom": False
            },
            {
                "id": "voc_lib_liam",
                "workspace_id": workspace_id,
                "name": "Liam",
                "provider": "OpenAI Voice",
                "gender": "Male",
                "description": "Deep and clear, suitable for scheduling and alerts.",
                "preview_url": "/api/static/previews/liam_preview.mp3",
                "status": "ready",
                "is_custom": False
            },
            {
                "id": "voc_lib_sophia",
                "workspace_id": workspace_id,
                "name": "Sophia",
                "provider": "Atlas Voice",
                "gender": "Female",
                "description": "Upbeat and helpful, excellent for inbound calls.",
                "preview_url": "/api/static/previews/sophia_preview.mp3",
                "status": "ready",
                "is_custom": False
            }
        ]
        
        # Read user-created/cloned voices from Firestore
        coll = firestore_client.collection("voice_profiles")
        docs = coll.stream()
        results = list(presets)
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                results.append(data)
        return results

    @staticmethod
    async def create_voice_profile(workspace_id: str, voice_data: dict) -> dict:
        voice_id = f"voc_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("voice_profiles").document(voice_id)
        
        full_data = {
            **voice_data,
            "id": voice_id,
            "workspace_id": workspace_id,
            "status": "ready",
            "is_custom": True,
            "preview_url": f"/api/static/previews/{voice_data.get('name', 'custom').lower()}_preview.mp3"
        }
        
        doc_ref.set(full_data)
        log_info(f"Custom voice profile '{full_data['name']}' ({voice_id}) created.")
        return full_data

    @staticmethod
    async def clone_voice_metadata(workspace_id: str, name: str, sample_url: str, provider: str) -> dict:
        voice_id = f"voc_clone_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("voice_profiles").document(voice_id)
        
        clone_data = {
            "id": voice_id,
            "workspace_id": workspace_id,
            "name": name,
            "provider": provider,
            "gender": "Neutral",
            "description": f"Cloned voice from reference sample: {name}",
            "preview_url": "/api/static/previews/cloned_preview.mp3",
            "status": "ready",
            "is_custom": True,
            "sample_file_url": sample_url
        }
        
        doc_ref.set(clone_data)
        log_info(f"Cloned voice '{name}' ({voice_id}) metadata stored.")
        return clone_data
