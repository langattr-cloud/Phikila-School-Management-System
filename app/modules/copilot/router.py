from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.scheduling.tenancy import Principal, resolve_principal

from .service import CopilotRateLimitError, consume_rate_limit, generate_insight

router = APIRouter()

@router.get("/insight")
def insight(response: Response, db: Session = Depends(get_db), principal: Principal = Depends(resolve_principal)):
    remaining = consume_rate_limit(db, principal.school_id, principal.user_id)
    response.headers["X-Copilot-RateLimit-Remaining"] = str(remaining)
    try:
        result = generate_insight(db, principal.school_id)
    except CopilotRateLimitError as error:
        response.headers["Retry-After"] = str(error.retry_after)
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Copilot rate limit reached. Try again later.") from None
    return result
