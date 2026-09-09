import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, require_role
from app.models.audit import AuditLog
from app.models.base import PharmacyVerificationStatus, UserRole
from app.models.pharmacy import Pharmacy
from app.models.user import User
from app.schemas.audit import AuditLogRead
from app.schemas.pharmacy import PharmacyRead, PharmacyVerificationAction
from app.services.audit_service import AuditService

router = APIRouter(dependencies=[Depends(require_role([UserRole.ADMIN]))])


@router.get("/stats")
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    """Summary metrics for the admin overview dashboard."""
    total_users_res = await db.execute(select(func.count(User.id)))
    total_users = total_users_res.scalar() or 0

    total_patients_res = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.PATIENT)
    )
    total_patients = total_patients_res.scalar() or 0

    total_pharmacies_res = await db.execute(select(func.count(Pharmacy.id)))
    total_pharmacies = total_pharmacies_res.scalar() or 0

    pending_pharmacies_res = await db.execute(
        select(func.count(Pharmacy.id)).where(
            Pharmacy.verification_status == PharmacyVerificationStatus.PENDING
        )
    )
    pending_pharmacies = pending_pharmacies_res.scalar() or 0

    verified_pharmacies_res = await db.execute(
        select(func.count(Pharmacy.id)).where(
            Pharmacy.verification_status == PharmacyVerificationStatus.VERIFIED
        )
    )
    verified_pharmacies = verified_pharmacies_res.scalar() or 0

    return {
        "total_users": total_users,
        "total_patients": total_patients,
        "total_pharmacies": total_pharmacies,
        "pending_pharmacies": pending_pharmacies,
        "verified_pharmacies": verified_pharmacies,
    }


@router.get("/pharmacies", response_model=List[PharmacyRead])
async def list_pharmacies(
    verification_status: Optional[PharmacyVerificationStatus] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List pharmacies with optional filtering by verification_status."""
    stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .order_by(desc(Pharmacy.created_at))
        .offset(skip)
        .limit(limit)
    )
    if verification_status:
        stmt = stmt.where(Pharmacy.verification_status == verification_status)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/pharmacies/{pharmacy_id}", response_model=PharmacyRead)
async def get_pharmacy_detail(
    pharmacy_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve complete pharmacy license and contact data for admin inspection."""
    stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.id == pharmacy_id)
    )
    result = await db.execute(stmt)
    pharmacy = result.scalars().first()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="الصيدلية غير موجودة",
        )
    return pharmacy


@router.post("/pharmacies/{pharmacy_id}/verification", response_model=PharmacyRead)
async def update_pharmacy_verification(
    pharmacy_id: uuid.UUID,
    action_data: PharmacyVerificationAction,
    request: Request,
    current_admin: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject pharmacy license verification with audit trail."""
    stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.id == pharmacy_id)
    )
    result = await db.execute(stmt)
    pharmacy = result.scalars().first()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="الصيدلية غير موجودة",
        )

    ip = request.client.host if request.client else None

    if action_data.action == "approve":
        pharmacy.verification_status = PharmacyVerificationStatus.VERIFIED
        pharmacy.rejection_reason = None
        await AuditService.log_event(
            db,
            action="PHARMACY_VERIFIED",
            target=f"pharmacy:{pharmacy.id}",
            user_id=current_admin.id,
            ip=ip,
            metadata_json={"license_number": pharmacy.license_number, "name": pharmacy.name},
        )
    elif action_data.action == "reject":
        pharmacy.verification_status = PharmacyVerificationStatus.REJECTED
        pharmacy.rejection_reason = action_data.reason or "تم رفض الترخيص من قبل الإدارة"
        await AuditService.log_event(
            db,
            action="PHARMACY_REJECTED",
            target=f"pharmacy:{pharmacy.id}",
            user_id=current_admin.id,
            ip=ip,
            metadata_json={
                "license_number": pharmacy.license_number,
                "reason": pharmacy.rejection_reason,
            },
        )

    await db.commit()
    refreshed_stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.id == pharmacy_id)
    )
    res = await db.execute(refreshed_stmt)
    return res.scalars().first()


@router.get("/audit-logs", response_model=List[AuditLogRead])
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List system security and audit logs."""
    stmt = (
        select(AuditLog)
        .order_by(desc(AuditLog.timestamp))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
