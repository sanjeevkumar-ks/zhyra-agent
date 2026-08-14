import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.utils.logger import log_info, log_error

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        
        # Capture basic request info
        method = request.method
        url = str(request.url)
        client_ip = request.client.host if request.client else "unknown"
        
        # Don't log sensitive endpoints' payloads or headers in detail
        sensitive_paths = ["/api/settings", "/api/auth"]
        is_sensitive = any(path in url for path in sensitive_paths)
        
        try:
            response = await call_next(request)
            duration = time.time() - start_time
            
            # Extract status code
            status_code = response.status_code
            
            # Log successful requests
            log_info(
                f"HTTP {method} {request.url.path} completed with {status_code}",
                method=method,
                path=request.url.path,
                status_code=status_code,
                duration_seconds=round(duration, 4),
                client_ip=client_ip
            )
            return response
            
        except Exception as e:
            duration = time.time() - start_time
            log_error(
                f"HTTP {method} {request.url.path} failed: {str(e)}",
                exc=e,
                method=method,
                path=request.url.path,
                duration_seconds=round(duration, 4),
                client_ip=client_ip
            )
            raise e
