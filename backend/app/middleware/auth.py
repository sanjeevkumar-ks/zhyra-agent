import os
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.logger import log_error, log_info

security_scheme = HTTPBearer(auto_error=False)

# Configuration keys
MOCK_USER_ID = os.getenv("MOCK_USER_ID", "usr_admin_test")

def is_bypass_auth() -> bool:
    # Never allow auth bypass when running on Vercel / production
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV"):
        return False
    return os.getenv("FIREBASE_BYPASS_AUTH", "false").lower() == "true"

class AuthUser:
    def __init__(self, uid: str, email: str = "", name: str = "", picture: str = ""):
        self.uid = uid
        self.email = email
        self.name = name
        self.picture = picture

async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
) -> AuthUser:
    """
    Validates Firebase ID token in Authorization header.
    If FIREBASE_BYPASS_AUTH is enabled, returns a mock user.
    """
    # 1. Check for bypass in local development
    if is_bypass_auth():
        # Check if caller wants a specific mock ID
        mock_uid = request.headers.get("X-Mock-User-Id", MOCK_USER_ID)
        return AuthUser(
            uid=mock_uid,
            email=f"{mock_uid}@example.com",
            name=f"Mock User ({mock_uid})",
            picture="https://lh3.googleusercontent.com/a/mock-avatar"
        )

    # 2. Check credentials
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing Authorization Header. Please provide a Bearer Firebase ID token."
        )
    
    token = credentials.credentials
    try:
        import firebase_admin
        from firebase_admin import auth
        
        # Verify the Firebase token
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        email = decoded_token.get("email", "")
        name = decoded_token.get("name", "")
        picture = decoded_token.get("picture", "")
        
        if not uid:
            raise HTTPException(status_code=401, detail="Invalid token payloads: uid missing.")
            
        return AuthUser(uid=uid, email=email, name=name, picture=picture)
        
    except ImportError:
        log_error("firebase-admin package is missing. Fallback logic failed.")
        raise HTTPException(status_code=500, detail="Authentication server configuration error.")
    except Exception as e:
        log_error("Firebase ID Token verification failed", exc=e)
        raise HTTPException(status_code=401, detail=f"Invalid ID Token: {str(e)}")
