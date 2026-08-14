from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.services.auth_service import AuthService
from app.schemas.users import UserResponse

router = APIRouter()

@router.post("/verify", response_model=UserResponse)
async def verify_user(current_user: AuthUser = Depends(get_current_user)):
    """Verifies Firebase Token and registers the user inside Firestore."""
    user_record = await AuthService.verify_and_register_user(current_user)
    return user_record
