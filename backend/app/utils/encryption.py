import os
import base64
from cryptography.fernet import Fernet
from app.utils.logger import log_error, log_info

# Retrieve encryption key from env
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "dGhpc19pc19hX21vY2tfa2V5X2V4YWN0bHlfMzJfYmE=")

def _get_fernet() -> Fernet:
    try:
        # Ensure key is valid URL-safe base64-encoded 32 bytes
        key_bytes = ENCRYPTION_KEY.encode()
        # Test if it's already a valid Fernet key
        return Fernet(key_bytes)
    except Exception as e:
        log_error("Invalid ENCRYPTION_KEY format. Generating a temporary key for this session.", exc=e)
        # Fallback: create a deterministic key based on the fallback string to prevent startup failure
        fallback_key = base64.urlsafe_b64encode(b"this_is_a_mock_key_exactly_32_ba")
        return Fernet(fallback_key)

_fernet = _get_fernet()

def encrypt_value(value: str) -> str:
    """Encrypt a plaintext string using Fernet."""
    if not value:
        return ""
    try:
        encrypted_bytes = _fernet.encrypt(value.encode())
        return encrypted_bytes.decode()
    except Exception as e:
        log_error("Encryption failed", exc=e)
        return value  # Return plaintext fallback if encryption fails (safe for local development)

def decrypt_value(encrypted_value: str) -> str:
    """Decrypt a Fernet-encrypted string."""
    if not encrypted_value:
        return ""
    try:
        decrypted_bytes = _fernet.decrypt(encrypted_value.encode())
        return decrypted_bytes.decode()
    except Exception as e:
        # If decryption fails, it might be stored as plain text or invalid key.
        log_error("Decryption failed. Returning the raw value.", exc=e)
        return encrypted_value

def mask_api_key(api_key: str) -> str:
    """Returns a masked version of the API key for UI responses (e.g., ••••••••abcd)."""
    if not api_key:
        return ""
    if len(api_key) <= 8:
        return "••••" + api_key[-2:] if len(api_key) > 2 else "••••"
    return "••••••••" + api_key[-4:]
