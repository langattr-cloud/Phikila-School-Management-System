"""Initial timetable API contracts. All endpoints require an authenticated caller.

Persistence and school-membership authorization are deliberately not stubbed here;
these routes expose readiness/contract metadata only until those policies are wired.
"""
from fastapi import APIRouter, Depends
from app.modules.authentication.supabase import get_supabase_claims

router = APIRouter(prefix="/api/timetabling", tags=["timetabling"])


@router.get("/contract", summary="Timetabling API contract and implementation phase")
async def get_timetabling_contract(claims: dict = Depends(get_supabase_claims)):
    """Authenticated contract discovery; does not expose school data or mutate state."""
    return {
        "module": "timetabling",
        "phase": 1,
        "persistence_ready": False,
        "generation_ready": False,
        "supported_contracts": ["project", "period", "lesson_requirement", "constraint"],
        "schedule_states": ["draft", "validated", "approved", "published", "archived"],
    }
