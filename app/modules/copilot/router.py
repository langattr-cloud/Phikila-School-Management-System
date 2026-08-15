from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.llm.models import TtLlmSetting
from app.modules.platform.authz import Identity, require_super_admin
from app.modules.scheduling.tenancy import Principal, resolve_principal

from .service import CopilotRateLimitError, consume_rate_limit, generate_insight, settings_row

router = APIRouter()

class RateLimitIn(BaseModel):
    requests: int = Field(ge=1, le=10000)
    window_seconds: int = Field(ge=10, le=86400)

@router.get("/insight")
def insight(response: Response, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    try:
        remaining = consume_rate_limit(db, principal.school_id, principal.user_id)
    except CopilotRateLimitError as error:
        response.headers["Retry-After"] = str(error.retry_after)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Copilot rate limit reached. Try again later.") from None
    response.headers["X-Copilot-RateLimit-Remaining"] = str(remaining)
    return generate_insight(db, principal.school_id)

@router.get("/settings")
def get_settings(db: Session = Depends(get_db), identity: Identity = Depends(require_super_admin)):
    row = settings_row(db)
    return {"requests": row.copilot_rate_limit, "window_seconds": row.copilot_rate_window_seconds}

@router.put("/settings")
def update_settings(payload: RateLimitIn, db: Session = Depends(get_db), identity: Identity = Depends(require_super_admin)):
    row = settings_row(db)
    row.copilot_rate_limit = payload.requests
    row.copilot_rate_window_seconds = payload.window_seconds
    row.updated_by = identity.email
    db.commit(); db.refresh(row)
    return {"requests": row.copilot_rate_limit, "window_seconds": row.copilot_rate_window_seconds}
