import os
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# Load env variables
load_dotenv()

# Import routers
from app.api import (
    auth, users, workspaces, agents, conversations,
    knowledge, voice, settings, providers, integrations,
    billing, analytics, memory, team, workflows, context
)

app = FastAPI(
    title="Zhyra AI OS API",
    description="Backend API for Zhyra AI OS - AI Agent platform for creating and managing AI Employees.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS configuration — allow Firebase Hosting + local dev
_frontend_url = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://zhyra.web.app",
    "https://zhyra-e0d80.web.app",
    "https://zhyra-e0d80.firebaseapp.com",
]
if _frontend_url and _frontend_url not in _allowed_origins:
    _allowed_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom middleware to track request durations
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Exception handling
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Log the detailed exception here
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error", "error": str(exc)},
    )

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

@app.get("/", tags=["Health"])
@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    return {
        "status": "ok",
        "timestamp": time.time(),
        "bypass_auth": os.getenv("FIREBASE_BYPASS_AUTH") == "true",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

