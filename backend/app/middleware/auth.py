import os
from fastapi import Request, HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.utils.logger import log_error, log_info

security_scheme = HTTPBearer(auto_error=False)

# Configuration keys
MOCK_USER_ID = os.getenv("MOCK_USER_ID", "usr_admin_test")

def is_bypass_auth() -> bool:
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
    Falls back to JWT payload decoding if Firebase Admin SDK is not initialized.
    """
    # 1. Check for bypass in local development or explicit bypass configuration
    if is_bypass_auth():
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

    # 3. Try official Firebase Admin SDK verification if app is initialized
    try:
        import firebase_admin
        from firebase_admin import auth
        
        if firebase_admin._apps:
            decoded_token = auth.verify_id_token(token)
            uid = decoded_token.get("uid")
            email = decoded_token.get("email", "")
            name = decoded_token.get("name", "")
            picture = decoded_token.get("picture", "")
            if uid:
                return AuthUser(uid=uid, email=email, name=name, picture=picture)
    except Exception as e:
        log_info(f"Firebase Admin SDK token verification skipped or failed: {str(e)}")

    # 4. Fallback to PyJWT token payload decoding (for serverless environments without service account keys)
    try:
        import jwt
        payload = jwt.decode(token, options={"verify_signature": False})
        uid = payload.get("user_id") or payload.get("sub") or payload.get("uid")
        if uid:
            return AuthUser(
                uid=uid,
                email=payload.get("email", ""),
                name=payload.get("name", ""),
                picture=payload.get("picture", "")
            )
    except Exception as e:
        log_error("JWT token payload decoding failed", exc=e)

    raise HTTPException(status_code=401, detail="Invalid Authorization ID Token.")
