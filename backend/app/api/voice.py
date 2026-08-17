import base64
import json
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Response
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.voice_service import VoiceService
from app.services.conversation_service import ConversationService
from app.ai.runtime.agent_runtime import AgentRuntime
from app.integrations.credential_store import load_credentials
from app.integrations.providers.elevenlabs import ElevenLabsProvider
from app.utils.logger import log_info, log_error
from typing import Optional

router = APIRouter()

@router.get("/status")
async def get_voice_status(workspace_id: str = Depends(get_user_workspace_id)):
    """Returns the connection status of the ElevenLabs voice provider."""
    return VoiceService.get_elevenlabs_status(workspace_id)

@router.get("/voices")
async def list_voices(workspace_id: str = Depends(get_user_workspace_id)):
    """Fetches real ElevenLabs voices for the workspace."""
    return await VoiceService.list_voices(workspace_id)

@router.post("/preview")
async def preview_voice(
    payload: dict,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Generates preview audio bytes for a given voice_id."""
    voice_id = payload.get("voice_id", "21m00Tcm4TlvDq8ikWAM")
    text = payload.get("text", "Hello! I am your AI agent powered by ElevenLabs.")
    audio_bytes = await VoiceService.preview_voice(workspace_id, voice_id, text)
    return Response(content=audio_bytes, media_type="audio/mpeg")

@router.post("/voices/clone")
async def clone_voice(
    name: str = Form(...),
    description: str = Form(""),
    confirm_permission: bool = Form(...),
    sample_file: UploadFile = File(...),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Clones a custom voice using a real speech sample file uploaded to ElevenLabs."""
    file_bytes = await sample_file.read()
    files = [("files", (sample_file.filename or "sample.mp3", file_bytes, sample_file.content_type or "audio/mpeg"))]
    
    return await VoiceService.clone_voice(
        workspace_id=workspace_id,
        name=name,
        description=description,
        files=files,
        confirm_permission=confirm_permission
    )

@router.delete("/voices/{voice_id}")
async def delete_voice(
    voice_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes a cloned custom voice from ElevenLabs and Firestore."""
    return await VoiceService.delete_voice(workspace_id, voice_id)

@router.post("/session")
async def create_voice_session(
    payload: dict,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Creates a realtime voice session token for an authorized agent."""
    agent_id = payload.get("agent_id")
    if not agent_id:
        raise HTTPException(status_code=400, detail="agent_id is required")
    return await VoiceService.create_session(workspace_id, agent_id)

@router.websocket("/ws/{session_id}")
async def voice_websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    Realtime WebSocket transport for streaming speech-to-text, agent reasoning,
    tool execution, and ElevenLabs text-to-speech audio chunks.
    """
    await websocket.accept()
    
    try:
        session = VoiceService.get_session(session_id)
    except HTTPException as e:
        await websocket.send_json({
            "event": "provider_error",
            "error": {"code": "VOICE_SESSION_EXPIRED", "message": str(e.detail)}
        })
        await websocket.close()
        return

    workspace_id = session["workspace_id"]
    agent_id = session["agent_id"]
    voice_id = session["voice_id"]
    
    # Obtain ElevenLabs API Key
    try:
        creds = load_credentials(workspace_id, "int_elevenlabs")
        api_key = creds.get("api_key") if creds else None
        if not api_key:
            raise Exception("ElevenLabs API Key missing")
    except Exception as e:
        await websocket.send_json({
            "event": "provider_error",
            "error": {"code": "VOICE_PROVIDER_AUTH_FAILED", "message": "ElevenLabs credentials unavailable."}
        })
        await websocket.close()
        return

    # Create temporary conversation ID for this session
    convo_id = f"con_vws_{session_id}"

    await websocket.send_json({
        "event": "session_started",
        "session_id": session_id,
        "agent_id": agent_id,
        "voice_id": voice_id
    })

    provider = ElevenLabsProvider()

    try:
        while True:
            raw_data = await websocket.receive_text()
            data = json.loads(raw_data)
            event_type = data.get("event")

            if event_type == "user_speech" or event_type == "user_transcript":
                user_text = data.get("text", "").strip()
                if not user_text:
                    continue

                await websocket.send_json({"event": "user_started_speaking"})
                await websocket.send_json({"event": "final_transcript", "text": user_text})
                await websocket.send_json({"event": "agent_thinking"})

                # Execute Zhyra Agent Brain
                try:
                    ai_reply = await AgentRuntime.execute(
                        workspace_id=workspace_id,
                        agent_id=agent_id,
                        query=user_text,
                        history=[],
                        conversation_id=convo_id
                    )
                except Exception as e:
                    log_error("Voice agent execution failed", exc=e)
                    await websocket.send_json({
                        "event": "tool_error",
                        "error": {"code": "VOICE_SESSION_FAILED", "message": "Agent failed to process request."}
                    })
                    continue

                agent_text = ai_reply.get("text") or ai_reply.get("message") or "I processed your request."
                actions = ai_reply.get("actions", [])

                if actions:
                    await websocket.send_json({"event": "tool_execution_started", "actions": actions})
                    await websocket.send_json({"event": "tool_execution_completed", "actions": actions})

                # Generate ElevenLabs TTS
                await websocket.send_json({"event": "agent_started_speaking", "text": agent_text})

                try:
                    audio_bytes = await provider.generate_tts_audio(
                        api_key=api_key,
                        text=agent_text,
                        voice_id=voice_id
                    )
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")

                    await websocket.send_json({
                        "event": "audio_chunk",
                        "audio_base64": audio_b64,
                        "format": "mp3"
                    })
                except Exception as e:
                    log_error("Voice TTS generation failed", exc=e)
                    await websocket.send_json({
                        "event": "provider_error",
                        "error": {"code": "VOICE_TTS_FAILED", "message": f"ElevenLabs TTS failed: {str(e)}"}
                    })

                await websocket.send_json({"event": "agent_finished_speaking"})

            elif event_type == "interrupt":
                # Handle user interruption / barge-in
                await websocket.send_json({"event": "interrupted"})

            elif event_type == "end_session":
                await websocket.send_json({"event": "session_ended"})
                break

    except WebSocketDisconnect:
        log_info(f"Voice WebSocket disconnected for session {session_id}")
    except Exception as e:
        log_error(f"Voice WebSocket error in session {session_id}", exc=e)
        try:
            await websocket.send_json({
                "event": "provider_error",
                "error": {"code": "VOICE_SESSION_ERROR", "message": "Realtime session error encountered."}
            })
        except Exception:
            pass
