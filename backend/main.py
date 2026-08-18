import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Import routers
from app.middleware.auth import is_bypass_auth
from app.api import (
    auth, users, workspaces, agents, conversations,
    knowledge, voice, settings, providers, integrations,
    billing, analytics, memory, team, workflows, context, notifications, widget
)

app = FastAPI(
    title="Zhyra AI OS API",
    description="Backend API for Zhyra AI OS - AI Agent platform for creating and managing AI Employees.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration — allow Firebase Hosting + local dev origins + environment overrides
_frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
_env_origins = os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")

_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5500",
    "https://zhyra.web.app",
    "https://zhyra-e0d80.web.app",
    "https://zhyra-e0d80.firebaseapp.com",
]

for orig in [_frontend_url] + _env_origins:
    o_clean = orig.strip()
    if o_clean and o_clean not in _allowed_origins:
        _allowed_origins.append(o_clean)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
)

# Custom middleware to track request durations & guarantee CORS headers on ALL responses
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        import traceback
        traceback.print_exc()
        req_origin = request.headers.get("origin") or "*"
        response = JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "error": str(exc)},
        )
        response.headers["Access-Control-Allow-Origin"] = req_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)

    # Guarantee CORS headers on widget & API responses for all status codes
    req_origin = request.headers.get("origin")
    if req_origin:
        response.headers["Access-Control-Allow-Origin"] = req_origin
        response.headers["Access-Control-Allow-Credentials"] = "true"

    return response

# Exception handling — guarantee CORS headers on error responses
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    traceback.print_exc()
    req_origin = request.headers.get("origin") or "*"
    res = JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )
    res.headers["Access-Control-Allow-Origin"] = req_origin
    res.headers["Access-Control-Allow-Credentials"] = "true"
    return res

# Register routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/users", tags=["User Profile"])
app.include_router(workspaces.router, prefix="/api/workspaces", tags=["Workspaces"])
app.include_router(agents.router, prefix="/api/agents", tags=["AI Agents"])
app.include_router(workflows.router, prefix="/api/workflows", tags=["Workflows"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["Conversations"])
app.include_router(knowledge.router, prefix="/api/knowledge", tags=["Knowledge Base"])
app.include_router(voice.router, prefix="/api/voice", tags=["Voice Studio"])
app.include_router(settings.router, prefix="/api/settings", tags=["Settings"])
app.include_router(providers.router, prefix="/api/providers", tags=["Providers"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["Integrations"])
app.include_router(billing.router, prefix="/api/billing", tags=["Billing"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(memory.router, prefix="/api/memory", tags=["AI Memory"])
app.include_router(team.router, prefix="/api/team", tags=["Team"])
app.include_router(context.router, prefix="/api/context", tags=["Context Optimization"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(widget.router, prefix="/api/widget", tags=["Embeddable Widget"])
app.include_router(widget.router, prefix="/api/chat", tags=["Widget Chat Alias"])

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "timestamp": time.time(),
        "bypass_auth": is_bypass_auth(),
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

