import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models.user import User
from app.schemas.user import UserProfileUpdate, UserRead

router = APIRouter()


@router.get("/me", response_model=UserRead)
async def get_current_user_profile(
    current_user: User = Depends(get_current_active_user),
):
    """Get the current user's profile details including coordinates."""
    return current_user


@router.patch("/me", response_model=UserRead)
async def update_current_user_profile(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile information such as location and coordinates."""
    if payload.name is not None:
        current_user.name = payload.name
    if payload.lat is not None:
        current_user.lat = payload.lat
    if payload.lng is not None:
        current_user.lng = payload.lng
    if payload.location is not None:
        current_user.location = payload.location

    await db.commit()
    await db.refresh(current_user)
    return current_user
