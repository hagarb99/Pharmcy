from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.api.deps import get_current_user, get_current_verified_pharmacy, get_db, require_role
from app.models.base import UserRole
from app.models.pharmacy import Pharmacy
from app.models.user import User
from app.schemas.pharmacy import PharmacyRead

from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter()


class PharmacyUpdatePayload(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    service_radius_km: Optional[float] = None
    delivery_available: Optional[bool] = None


@router.get("/my-pharmacy", response_model=PharmacyRead)
async def get_my_pharmacy(
    current_user: User = Depends(require_role([UserRole.PHARMACY])),
):
    """Retrieve pharmacy profile for currently authenticated pharmacy user."""
    if not current_user.pharmacy_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لا يوجد ملف صيدلية مرتبط بهذا الحساب",
        )
    return current_user.pharmacy_profile


@router.patch("/my-pharmacy", response_model=PharmacyRead)
async def update_my_pharmacy(
    payload: PharmacyUpdatePayload,
    current_user: User = Depends(require_role([UserRole.PHARMACY])),
    db: AsyncSession = Depends(get_db),
):
    """Update pharmacy service details (radius, delivery, location)."""
    pharmacy = current_user.pharmacy_profile
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لا يوجد ملف صيدلية مرتبط بهذا الحساب",
        )

    if payload.name is not None:
        pharmacy.name = payload.name
    if payload.address is not None:
        pharmacy.address = payload.address
    if payload.lat is not None:
        pharmacy.lat = payload.lat
    if payload.lng is not None:
        pharmacy.lng = payload.lng
    if payload.service_radius_km is not None:
        pharmacy.service_radius_km = payload.service_radius_km
    if payload.delivery_available is not None:
        pharmacy.delivery_available = payload.delivery_available

    await db.commit()
    refreshed_stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.id == pharmacy.id)
    )
    res = await db.execute(refreshed_stmt)
    return res.scalars().first()


@router.get("/active-orders-guard")
async def active_orders_guard_test(
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
):
    """
    Test endpoint guarded by get_current_verified_pharmacy.
    Unverified pharmacies receive 403 Forbidden with license verification pending message.
    """
    return {
        "status": "allowed",
        "message": f"صيدلية {pharmacy.name} معتمدة ومؤهلة لاستقبال الطلبات.",
        "verification_status": pharmacy.verification_status,
    }


@router.get("/incoming-requests")
async def incoming_requests_alias(
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
    db: AsyncSession = Depends(get_db),
):
    from app.api.v1.quotes import get_incoming_requests_for_pharmacy
    return await get_incoming_requests_for_pharmacy(pharmacy=pharmacy, db=db)

