from pydantic import BaseModel, Field
from typing import Optional, List

class ProviderConfigBase(BaseModel):
    default_model: Optional[str] = None
    temperature: float = Field(0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(1000, ge=1, le=128000)
    streaming: bool = True

class ProviderConfigUpdate(ProviderConfigBase):
    api_key: Optional[str] = None
    organization_id: Optional[str] = None
    base_url: Optional[str] = None

class ProviderConfigResponse(ProviderConfigBase):
    provider_name: str
    connected: bool = False
    organization_id: Optional[str] = None
    base_url: Optional[str] = None
    masked_key: Optional[str] = None
    available_models: List[str] = Field(default_factory=list)

class ProviderCardResponse(BaseModel):
    name: str
    logo_url: Optional[str] = None
    connected: bool = False
    active: bool = False
    available_models: List[str] = Field(default_factory=list)

class TestConnectionRequest(BaseModel):
    provider: str
    api_key: str
    organization_id: Optional[str] = None
    base_url: Optional[str] = None

class TestConnectionResponse(BaseModel):
    success: bool
    message: str
    available_models: List[str] = Field(default_factory=list)
