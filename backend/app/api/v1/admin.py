from datetime import datetime, timezone
import json
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, require_role
from app.models.audit import AuditLog
from app.models.base import (
    ChangeRequestStatus,
    PharmacyStatus,
    PharmacyVerificationStatus,
    UserRole,
)
from app.models.order import Order
from app.models.pharmacy import Pharmacy
from app.models.pharmacy_change_request import PharmacyChangeRequest
from app.models.request import PrescriptionRequest
from app.models.user import User
from app.schemas.audit import AuditLogRead
from app.schemas.pharmacy import PharmacyRead, PharmacyVerificationAction
from app.schemas.pharmacy_change_request import (
    ChangeRequestReviewAction,
    PharmacyChangeRequestOut,
)
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


@router.get("/change-requests", response_model=List[PharmacyChangeRequestOut])
async def list_change_requests(
    status_filter: Optional[ChangeRequestStatus] = Query(None, alias="status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    List sensitive pharmacy profile change requests with optional status filter.
    Includes pharmacy details and reviewer name.
    """
    stmt = (
        select(PharmacyChangeRequest)
        .options(
            selectinload(PharmacyChangeRequest.pharmacy),
            selectinload(PharmacyChangeRequest.reviewed_by),
        )
        .order_by(desc(PharmacyChangeRequest.created_at))
        .offset(skip)
        .limit(limit)
    )
    if status_filter:
        stmt = stmt.where(PharmacyChangeRequest.status == status_filter)

    result = await db.execute(stmt)
    crs = result.scalars().all()

    return [
        PharmacyChangeRequestOut(
            id=cr.id,
            pharmacy_id=cr.pharmacy_id,
            pharmacy_name=cr.pharmacy.name if cr.pharmacy else "غير معروف",
            pharmacy_license=cr.pharmacy.license_number if cr.pharmacy else "غير محدد",
            field_name=cr.field_name,
            old_value=cr.old_value,
            new_value=cr.new_value,
            status=cr.status,
            admin_notes=cr.admin_notes,
            created_at=cr.created_at,
            reviewed_at=cr.reviewed_at,
            reviewed_by_name=cr.reviewed_by.name if cr.reviewed_by else None,
        )
        for cr in crs
    ]


@router.post("/change-requests/{request_id}/approve", response_model=PharmacyChangeRequestOut)
async def approve_change_request(
    request_id: uuid.UUID,
    payload: ChangeRequestReviewAction,
    request: Request,
    current_admin: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve a pending pharmacy change request and apply the changes immediately.
    Includes pre-approval collision checks (e.g. unique phone constraints).
    """
    stmt = (
        select(PharmacyChangeRequest)
        .options(
            selectinload(PharmacyChangeRequest.pharmacy).selectinload(Pharmacy.user),
            selectinload(PharmacyChangeRequest.reviewed_by),
        )
        .where(PharmacyChangeRequest.id == request_id)
    )
    res = await db.execute(stmt)
    cr = res.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="طلب التعديل غير موجود")

    if cr.status != ChangeRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"لا يمكن اعتماد هذا الطلب لأنه بحالة '{cr.status.value}' مسبقاً.",
        )

    pharmacy = cr.pharmacy
    if not pharmacy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الصيدلية المرتبطة بهذا الطلب غير موجودة")

    # Pre-Approval Collision Check for Phone Numbers
    if cr.field_name == "phone":
        col_stmt = select(User).where(User.phone == cr.new_value, User.id != pharmacy.user_id)
        colliding_user = (await db.execute(col_stmt)).scalar_one_or_none()
        if colliding_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"لا يمكن اعتماد الطلب: رقم الهاتف الجديد ({cr.new_value}) مستخدم بالفعل من قبل حساب آخر.",
            )
        if pharmacy.user:
            pharmacy.user.phone = cr.new_value

    elif cr.field_name == "commercial_name":
        pharmacy.name = cr.new_value.strip()

    elif cr.field_name == "address_and_coordinates":
        try:
            loc_data = json.loads(cr.new_value)
            pharmacy.address = loc_data.get("address", pharmacy.address)
            pharmacy.lat = float(loc_data.get("lat", pharmacy.lat))
            pharmacy.lng = float(loc_data.get("lng", pharmacy.lng))
        except (json.JSONDecodeError, ValueError, KeyError):
            # Fallback if raw text
            pharmacy.address = cr.new_value

    # Update change request record
    cr.status = ChangeRequestStatus.APPROVED
    cr.reviewed_at = datetime.now(timezone.utc)
    cr.reviewed_by_id = current_admin.id
    cr.admin_notes = payload.admin_notes or "تم اعتماد التعديل وتطبيقه بنجاح"

    # Audit Log
    ip = request.client.host if request.client else None
    await AuditService.log_event(
        db,
        action="PHARMACY_CHANGE_REQUEST_APPROVED",
        target=f"pharmacy_change_request:{cr.id}",
        user_id=current_admin.id,
        ip=ip,
        metadata_json={
            "pharmacy_id": str(pharmacy.id),
            "pharmacy_name": pharmacy.name,
            "field_name": cr.field_name,
            "new_value": cr.new_value,
        },
    )

    await db.commit()
    await db.refresh(cr)

    return PharmacyChangeRequestOut(
        id=cr.id,
        pharmacy_id=cr.pharmacy_id,
        pharmacy_name=pharmacy.name,
        pharmacy_license=pharmacy.license_number,
        field_name=cr.field_name,
        old_value=cr.old_value,
        new_value=cr.new_value,
        status=cr.status,
        admin_notes=cr.admin_notes,
        created_at=cr.created_at,
        reviewed_at=cr.reviewed_at,
        reviewed_by_name=current_admin.name,
    )


@router.post("/change-requests/{request_id}/reject", response_model=PharmacyChangeRequestOut)
async def reject_change_request(
    request_id: uuid.UUID,
    payload: ChangeRequestReviewAction,
    request: Request,
    current_admin: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending pharmacy profile change request with reason."""
    stmt = (
        select(PharmacyChangeRequest)
        .options(
            selectinload(PharmacyChangeRequest.pharmacy),
            selectinload(PharmacyChangeRequest.reviewed_by),
        )
        .where(PharmacyChangeRequest.id == request_id)
    )
    res = await db.execute(stmt)
    cr = res.scalar_one_or_none()
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="طلب التعديل غير موجود")

    if cr.status != ChangeRequestStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"لا يمكن رفض هذا الطلب لأنه بحالة '{cr.status.value}' مسبقاً.",
        )

    cr.status = ChangeRequestStatus.REJECTED
    cr.reviewed_at = datetime.now(timezone.utc)
    cr.reviewed_by_id = current_admin.id
    cr.admin_notes = payload.admin_notes or "تم رفض طلب التعديل من قبل الإدارة"

    ip = request.client.host if request.client else None
    await AuditService.log_event(
        db,
        action="PHARMACY_CHANGE_REQUEST_REJECTED",
        target=f"pharmacy_change_request:{cr.id}",
        user_id=current_admin.id,
        ip=ip,
        metadata_json={
            "pharmacy_id": str(cr.pharmacy_id),
            "field_name": cr.field_name,
            "reason": cr.admin_notes,
        },
    )

    await db.commit()
    await db.refresh(cr)

    return PharmacyChangeRequestOut(
        id=cr.id,
        pharmacy_id=cr.pharmacy_id,
        pharmacy_name=cr.pharmacy.name if cr.pharmacy else None,
        pharmacy_license=cr.pharmacy.license_number if cr.pharmacy else None,
        field_name=cr.field_name,
        old_value=cr.old_value,
        new_value=cr.new_value,
        status=cr.status,
        admin_notes=cr.admin_notes,
        created_at=cr.created_at,
        reviewed_at=cr.reviewed_at,
        reviewed_by_name=current_admin.name,
    )


@router.post("/pharmacies/{pharmacy_id}/toggle-status", response_model=PharmacyRead)
async def toggle_pharmacy_status(
    pharmacy_id: uuid.UUID,
    request: Request,
    current_admin: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle pharmacy status between ACTIVE and SUSPENDED.
    Suspended pharmacies cannot receive new requests or submit quotes.
    """
    stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.id == pharmacy_id)
    )
    res = await db.execute(stmt)
    pharmacy = res.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الصيدلية غير موجودة")

    if pharmacy.status == PharmacyStatus.ACTIVE:
        pharmacy.status = PharmacyStatus.SUSPENDED
        action_name = "PHARMACY_SUSPENDED"
    else:
        pharmacy.status = PharmacyStatus.ACTIVE
        action_name = "PHARMACY_ACTIVATED"

    ip = request.client.host if request.client else None
    await AuditService.log_event(
        db,
        action=action_name,
        target=f"pharmacy:{pharmacy.id}",
        user_id=current_admin.id,
        ip=ip,
        metadata_json={
            "name": pharmacy.name,
            "new_status": pharmacy.status.value,
        },
    )

    await db.commit()
    await db.refresh(pharmacy)
    return pharmacy


@router.get("/stats/advanced")
async def get_advanced_admin_stats(db: AsyncSession = Depends(get_db)):
    """
    Extended KPIs for the Admin control center:
    - Total Requests and Orders
    - Marketplace Fulfillment Rate
    - Pending Profile Change Requests
    - Active vs Suspended pharmacies
    """
    total_reqs = (await db.execute(select(func.count(PrescriptionRequest.id)))).scalar() or 0
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    pending_crs = (
        await db.execute(
            select(func.count(PharmacyChangeRequest.id)).where(
                PharmacyChangeRequest.status == ChangeRequestStatus.PENDING
            )
        )
    ).scalar() or 0
    active_pharmacies = (
        await db.execute(
            select(func.count(Pharmacy.id)).where(
                Pharmacy.status == PharmacyStatus.ACTIVE,
                Pharmacy.verification_status == PharmacyVerificationStatus.VERIFIED,
            )
        )
    ).scalar() or 0

    fulfillment_rate = round((total_orders / total_reqs * 100), 1) if total_reqs > 0 else 0.0

    return {
        "total_requests": total_reqs,
        "total_orders": total_orders,
        "fulfillment_rate_percent": fulfillment_rate,
        "pending_change_requests": pending_crs,
        "active_verified_pharmacies": active_pharmacies,
    }
