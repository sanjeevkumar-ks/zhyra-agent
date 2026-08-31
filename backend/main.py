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
    billing, analytics, memory, team, workflows, context, notifications, widget,
    admin_debug, playground, zhyra, master_agent,
)
from app.api import channels as channels_api
from app.api import telegram as telegram_webhook
from app.api.admin import (
    auth as admin_auth,
    users as admin_users,
    invites as admin_invites,
    audit as admin_audit,
    overview as admin_overview,
    customers as admin_customers,
    workspaces as admin_workspaces,
    agents as admin_agents,
    conversations as admin_conversations,
    issues as admin_issues,
    integrations as admin_integrations,
    health as admin_health,
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
    "https://zhyra-admin.web.app",
    "https://zhyra-e0d80.web.app",
    "https://zhyra-e0d80.firebaseapp.com",
    "https://zhyra-admin.firebaseapp.com",
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
app.include_router(channels_api.router, prefix="/api/agents", tags=["Agent Channels"])
app.include_router(telegram_webhook.router, prefix="/api/channels", tags=["Telegram Webhook"])
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
app.include_router(widget.router, prefix="/api", tags=["Widget Direct Alias"])
app.include_router(playground.router, prefix="/api/playground", tags=["AI Testing Playground"])
app.include_router(master_agent.router, prefix="/api/master-agent", tags=["Master Agent Architecture"])
app.include_router(zhyra.router, prefix="/api/zhyra", tags=["Zhyra Master Agent"])
app.include_router(zhyra.router, prefix="/api/assistant", tags=["Zhyra Legacy Assistant"])
app.include_router(admin_auth.router, prefix="/api/admin/auth", tags=["Admin Auth"])
app.include_router(admin_users.router, prefix="/api/admin/users", tags=["Admin Users"])
app.include_router(admin_invites.router, prefix="/api/admin/invites", tags=["Admin Invites"])
app.include_router(admin_audit.router, prefix="/api/admin", tags=["Admin Audit"])
app.include_router(admin_overview.router, prefix="/api/admin", tags=["Admin Overview"])
app.include_router(admin_customers.router, prefix="/api/admin/customers", tags=["Admin Customers"])
app.include_router(admin_workspaces.router, prefix="/api/admin/workspaces", tags=["Admin Workspaces"])
app.include_router(admin_agents.router, prefix="/api/admin/agents", tags=["Admin Agents"])
app.include_router(admin_conversations.router, prefix="/api/admin/conversations", tags=["Admin Conversations"])
app.include_router(admin_issues.router, prefix="/api/admin/issues", tags=["Admin Issues"])
app.include_router(admin_integrations.router, prefix="/api/admin/integrations", tags=["Admin Integrations"])
app.include_router(admin_health.router, prefix="/api/admin/health", tags=["Admin Health"])
app.include_router(admin_debug.router, prefix="/api/admin", tags=["Admin Debug"])

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

