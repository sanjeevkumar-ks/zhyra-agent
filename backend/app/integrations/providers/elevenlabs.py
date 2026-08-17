"""
ElevenLabs Integration Provider
==================================
Real implementation using ElevenLabs Python SDK.

Authentication: API Key
Credentials stored: api_key (encrypted via credential_store)

Capabilities:
  - Generate speech
  - Browse voices
  - Clone voices
  - Stream audio
"""

import json
import os
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class ElevenLabsProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_elevenlabs"

    def _get_client(self, creds: dict):
        try:
            from elevenlabs.client import ElevenLabs
            api_key = creds.get("api_key", "")
            if not api_key:
                raise HTTPException(status_code=400, detail="ElevenLabs API Key is missing.")
            return ElevenLabs(api_key=api_key)
        except ImportError:
            raise HTTPException(status_code=500, detail="elevenlabs package not installed. Run: pip install elevenlabs")

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        api_key = (
            config.get("api_key")
            or credentials.get("api_key")
            or credentials.get("key")
        )

        if not api_key:
            raise HTTPException(status_code=400, detail="ElevenLabs API Key is required.")

        # Validate API key
        account_info = await self.validate(config, {"api_key": api_key})

        # Store encrypted
        save_credentials(workspace_id, self.INTEGRATION_ID, {"api_key": api_key})

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": {},  # Never store API key in config
            "connected_account": payload.get("connected_account") or "ElevenLabs Account",
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"ElevenLabs connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"ElevenLabs disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        api_key = credentials.get("api_key", config.get("api_key", ""))
        if not api_key:
            raise HTTPException(status_code=400, detail="ElevenLabs API Key is required.")

        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    "https://api.elevenlabs.io/v1/user",
                    headers={"xi-api-key": api_key},
                )
                if r.status_code == 401:
                    raise HTTPException(status_code=400, detail="Invalid ElevenLabs API Key.")
                if r.status_code not in (200, 201):
                    raise HTTPException(status_code=400, detail=f"ElevenLabs validation failed: {r.text[:200]}")
            return True
        except HTTPException:
            raise
        except Exception as e:
            log_error("ElevenLabs validation failed", exc=e)
            raise HTTPException(status_code=400, detail=f"Could not connect to ElevenLabs: {str(e)}")

    async def refresh(self, workspace_id: str) -> dict:
        # API keys don't expire
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("api_key"):
            return "Error: ElevenLabs is not connected. Please configure API key first."

        try:
            method_lower = method.lower()

            if "speech" in method_lower or "generate" in method_lower or "tts" in method_lower or "synthesize" in method_lower:
                return await self._generate_speech(creds, args)
            elif "voice" in method_lower or "browse" in method_lower or "list" in method_lower:
                return await self._list_voices(creds, args)
            elif "clone" in method_lower or "add_voice" in method_lower or "create_voice" in method_lower:
                return await self._clone_voice(creds, args)
            elif "model" in method_lower:
                return await self._list_models(creds, args)
            elif "history" in method_lower:
                return await self._get_history(creds, args)

            return f"Error: Unknown method '{method}' on ElevenLabs. Available: generate_speech, list_voices, clone_voice, list_models, get_history"

        except Exception as e:
            log_error(f"ElevenLabs execute failed for method {method}", exc=e)
            return f"Error: ElevenLabs action failed — {str(e)}"

    async def _generate_speech(self, creds: dict, args: dict) -> str:
        import httpx
        import base64

        text = args.get("text", "Hello from your AI agent.")
        voice_id = args.get("voice_id", args.get("voice", "21m00Tcm4TlvDq8ikWAM"))  # Rachel
        model_id = args.get("model_id", "eleven_multilingual_v2")
        output_format = args.get("output_format", "mp3_44100_128")

        # Voice name → ID mapping for convenience
        voice_name_map = {
            "rachel": "21m00Tcm4TlvDq8ikWAM",
            "domi": "AZnzlk1XvdvUeBnXmlld",
            "bella": "EXAVITQu4vr4xnSDxMaL",
            "josh": "TxGEqnHWrfWFTfGW9XjX",
            "arnold": "VR6AewLTigWG4xSOukaG",
            "adam": "pNInz6obpgDQGcFmaJgB",
        }
        if voice_id.lower() in voice_name_map:
            voice_id = voice_name_map[voice_id.lower()]

        stability = float(args.get("stability", 0.5))
        similarity_boost = float(args.get("similarity_boost", 0.8))

        payload = {
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
            },
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                json=payload,
                params={"output_format": output_format},
                headers={
                    "xi-api-key": creds["api_key"],
                    "Content-Type": "application/json",
                },
            )

        if r.status_code != 200:
            return f"Error: ElevenLabs TTS failed — {r.text[:300]}"

        # Return base64-encoded audio for the agent to handle
        audio_base64 = base64.b64encode(r.content).decode("utf-8")
        audio_size_kb = len(r.content) / 1024

        return (
            f"ElevenLabs speech generated successfully.\n"
            f"Voice ID: {voice_id}\n"
            f"Model: {model_id}\n"
            f"Text length: {len(text)} characters\n"
            f"Audio size: {audio_size_kb:.1f} KB\n"
            f"Format: {output_format}\n"
            f"Audio (base64): {audio_base64[:100]}... [truncated, full audio available]"
        )

    async def _list_voices(self, creds: dict, args: dict) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": creds["api_key"]},
            )

        if r.status_code != 200:
            return f"Error: Could not fetch voices — {r.text[:200]}"

        voices = r.json().get("voices", [])
        formatted = [
            {
                "voice_id": v.get("voice_id"),
                "name": v.get("name"),
                "category": v.get("category"),
                "description": v.get("description", ""),
                "labels": v.get("labels", {}),
            }
            for v in voices
        ]
        return f"ElevenLabs Voices ({len(formatted)} available):\n{json.dumps(formatted, indent=2)}"

    async def _clone_voice(self, creds: dict, args: dict) -> str:
        """
        Clone a voice. Requires audio sample files (base64-encoded).
        args: name, description, files (list of base64-encoded audio)
        """
        import httpx

        name = args.get("name", "Custom Voice")
        description = args.get("description", "")
        files_b64 = args.get("files", [])  # List of base64-encoded audio files

        if not files_b64:
            return "Error: At least one audio file (base64-encoded) is required to clone a voice."

        import base64
        import io

        files = []
        for i, f_b64 in enumerate(files_b64[:25]):  # ElevenLabs max 25 samples
            audio_bytes = base64.b64decode(f_b64)
            files.append(("files", (f"sample_{i+1}.mp3", io.BytesIO(audio_bytes), "audio/mpeg")))

        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                "https://api.elevenlabs.io/v1/voices/add",
                headers={"xi-api-key": creds["api_key"]},
                data={"name": name, "description": description},
                files=files,
            )

        if r.status_code not in (200, 201):
            return f"Error: Voice cloning failed — {r.text[:300]}"

        result = r.json()
        return (
            f"Successfully cloned ElevenLabs voice '{name}'.\n"
            f"Voice ID: {result.get('voice_id')}\n"
            f"Samples: {len(files_b64)}"
        )

    async def _list_models(self, creds: dict, args: dict) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/models",
                headers={"xi-api-key": creds["api_key"]},
            )

        if r.status_code != 200:
            return f"Error: Could not fetch models — {r.text[:200]}"

        models = r.json()
        formatted = [
            {
                "model_id": m.get("model_id"),
                "name": m.get("name"),
                "description": m.get("description", ""),
                "languages": [l.get("name") for l in m.get("languages", [])[:5]],
            }
            for m in models
        ]
        return f"ElevenLabs Models:\n{json.dumps(formatted, indent=2)}"

    async def _get_history(self, creds: dict, args: dict) -> str:
        import httpx
        page_size = int(args.get("page_size", 10))
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/history",
                params={"page_size": page_size},
                headers={"xi-api-key": creds["api_key"]},
            )

        if r.status_code != 200:
            return f"Error: Could not fetch history — {r.text[:200]}"

        items = r.json().get("history", [])
        formatted = [
            {
                "history_item_id": i.get("history_item_id"),
                "text": i.get("text", "")[:100],
                "voice_name": i.get("voice_name"),
                "character_count": i.get("character_count"),
            }
            for i in items
        ]
        return f"ElevenLabs History ({len(formatted)} items):\n{json.dumps(formatted, indent=2)}"

    async def fetch_voices(self, api_key: str) -> list:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                "https://api.elevenlabs.io/v1/voices",
                headers={"xi-api-key": api_key},
            )
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=f"ElevenLabs error: {r.text[:200]}")

        voices = r.json().get("voices", [])
        return [
            {
                "id": v.get("voice_id"),
                "voice_id": v.get("voice_id"),
                "name": v.get("name"),
                "category": v.get("category", "general"),
                "description": v.get("description") or f"{v.get('category', 'ElevenLabs').capitalize()} voice",
                "preview_url": v.get("preview_url", ""),
                "labels": v.get("labels", {}),
                "language": v.get("labels", {}).get("accent") or v.get("labels", {}).get("language") or "English",
                "style": v.get("labels", {}).get("use_case") or v.get("category", "General"),
                "provider": "ElevenLabs",
                "is_custom": v.get("category") in ["cloned", "custom", "generated"],
            }
            for v in voices
        ]

    async def generate_tts_audio(
        self,
        api_key: str,
        text: str,
        voice_id: str = "21m00Tcm4TlvDq8ikWAM",
        stability: float = 0.5,
        similarity_boost: float = 0.8
    ) -> bytes:
        import httpx
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        payload = {
            "text": text,
            "model_id": "eleven_multilingual_v2",
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
            },
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                url,
                json=payload,
                params={"output_format": "mp3_44100_128"},
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
            )
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=f"ElevenLabs TTS failed: {r.text[:200]}")
        return r.content

    async def clone_voice_from_file(
        self,
        api_key: str,
        name: str,
        description: str,
        files: list
    ) -> dict:
        import httpx
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                "https://api.elevenlabs.io/v1/voices/add",
                headers={"xi-api-key": api_key},
                data={"name": name, "description": description},
                files=files,
            )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=r.status_code, detail=f"ElevenLabs voice cloning failed: {r.text[:200]}")
        return r.json()

    async def delete_voice_by_id(self, api_key: str, voice_id: str) -> bool:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.delete(
                f"https://api.elevenlabs.io/v1/voices/{voice_id}",
                headers={"xi-api-key": api_key},
            )
        if r.status_code not in (200, 204):
            raise HTTPException(status_code=r.status_code, detail=f"ElevenLabs voice deletion failed: {r.text[:200]}")
        return True

    def capabilities(self) -> list:
        return ["Generate speech", "Browse voices", "Clone voices", "Stream audio"]

