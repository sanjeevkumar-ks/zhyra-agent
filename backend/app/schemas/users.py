from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarded: bool = False

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    onboarded: Optional[bool] = None

class UserResponse(UserBase):
    uid: str
    workspace_id: Optional[str] = None

    class Config:
        from_attributes = True
