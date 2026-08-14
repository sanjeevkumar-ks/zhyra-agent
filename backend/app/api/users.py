from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.database.firestore import firestore_client
from app.schemas.users import UserResponse, UserUpdate
from fastapi import HTTPException

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: AuthUser = Depends(get_current_user)):
    user_ref = firestore_client.collection("users").document(current_user.uid)
    snap = user_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User record not found.")
    return snap.to_dict()

@router.put("/me", response_model=UserResponse)
async def update_me(update_payload: UserUpdate, current_user: AuthUser = Depends(get_current_user)):
    user_ref = firestore_client.collection("users").document(current_user.uid)
    snap = user_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="User record not found.")
    
    update_data = {k: v for k, v in update_payload.model_dump().items() if v is not None}
    if update_data:
        user_ref.update(update_data)
        
    return (user_ref.get()).to_dict()
