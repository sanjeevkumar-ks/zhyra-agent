import logging
import json
import time
from typing import Any, Dict

class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
        }
        if hasattr(record, "extra_fields") and isinstance(record.extra_fields, dict):
            log_data.update(record.extra_fields)
        return json.dumps(log_data)

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    
    # Avoid duplicate handlers if logger is fetched multiple times
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = StructuredFormatter(datefmt="%Y-%m-%dT%H:%M:%S")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.propagate = False
        
    return logger

# Convenience functions
logger = get_logger("atlas-backend")

def log_info(msg: str, **kwargs):
    logger.info(msg, extra={"extra_fields": kwargs})

def log_error(msg: str, exc: Exception = None, **kwargs):
    if exc:
        kwargs["error_message"] = str(exc)
        kwargs["error_type"] = exc.__class__.__name__
    logger.error(msg, extra={"extra_fields": kwargs})

def log_ai_call(provider: str, model: str, duration: float, tokens: int = None, errors: str = None):
    fields = {
        "provider": provider,
        "model": model,
        "duration_seconds": duration,
        "token_usage": tokens,
        "errors": errors
    }
    logger.info(f"AI Call completed: {provider} - {model}", extra={"extra_fields": fields})
