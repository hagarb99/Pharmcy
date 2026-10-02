from datetime import datetime, timezone
import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    get_current_user,
    get_current_verified_pharmacy,
    get_db,
    require_role,
)
from app.models.base import ChangeRequestStatus, UserRole
from app.models.pharmacy import Pharmacy
from app.models.pharmacy_change_request import PharmacyChangeRequest
from app.models.user import User
from app.schemas.pharmacy import PharmacyRead
from app.schemas.pharmacy_change_request import (
    PharmacyChangeRequestOut,
    PharmacyProfileOut,
    PharmacyProfileUpdate,
)

router = APIRouter()


@router.get("/my-pharmacy")
@router.get("/my-profile")
async def get_my_pharmacy_profile(
    current_user: User = Depends(require_role([UserRole.PHARMACY])),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve comprehensive pharmacy profile including contact info and pending change requests.
    """
    pharmacy_stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.user_id == current_user.id)
    )
    res = await db.execute(pharmacy_stmt)
    pharmacy = res.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لا يوجد ملف صيدلية مرتبط بهذا الحساب",
        )

    # Fetch pending change requests
    cr_stmt = (
        select(PharmacyChangeRequest)
        .where(
            PharmacyChangeRequest.pharmacy_id == pharmacy.id,
            PharmacyChangeRequest.status == ChangeRequestStatus.PENDING,
        )
        .order_by(desc(PharmacyChangeRequest.created_at))
    )
    cr_res = await db.execute(cr_stmt)
    pending_crs = cr_res.scalars().all()

    user_phone = (pharmacy.user.phone if pharmacy.user and pharmacy.user.phone else current_user.phone)

    return {
        "id": pharmacy.id,
        "name": pharmacy.name,
        "phone": user_phone,
        "address": pharmacy.address,
        "lat": pharmacy.lat,
        "lng": pharmacy.lng,
        "service_radius_km": pharmacy.service_radius_km,
        "license_number": pharmacy.license_number,
        "verification_status": pharmacy.verification_status,
        "status": pharmacy.status,
        "delivery_available": pharmacy.delivery_available,
        "pending_change_requests": [
            PharmacyChangeRequestOut(
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
            )
            for cr in pending_crs
        ],
    }


@router.patch("/my-pharmacy")
@router.patch("/my-profile")
async def update_my_pharmacy_profile(
    payload: PharmacyProfileUpdate,
    current_user: User = Depends(require_role([UserRole.PHARMACY])),
    db: AsyncSession = Depends(get_db),
):
    """
    Update pharmacy profile with strict operational vs. sensitive segregation:
    - Operational changes (delivery_available, service_radius_km) take effect IMMEDIATELY.
    - Sensitive changes (phone, commercial_name, address, lat, lng) create/update a
      ChangeRequest pending Admin approval to prevent unauthorized tampering or geo-spoofing.
    """
    pharmacy_stmt = (
        select(Pharmacy)
        .options(selectinload(Pharmacy.user))
        .where(Pharmacy.user_id == current_user.id)
    )
    res = await db.execute(pharmacy_stmt)
    pharmacy = res.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لا يوجد ملف صيدلية مرتبط بهذا الحساب",
        )

    # Validate sensitive fields with clear Arabic messages
    if payload.phone:
        import re
        if not re.match(r"^\+?[0-9]{10,15}$", payload.phone):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="رقم الهاتف غير صالح. يرجى إدخال رقم صحيح يتكون من 10 إلى 15 رقماً."
            )

    if payload.name and len(payload.name.strip()) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="اسم الصيدلية قصير جداً (حرفان على الأقل)."
        )

    if payload.address and len(payload.address.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="عنوان الصيدلية قصير جداً (5 أحرف على الأقل)."
        )

    applied_immediately: List[str] = []
    queued_for_approval: List[str] = []

    # 1. Operational fields: apply immediately
    if payload.delivery_available is not None:
        pharmacy.delivery_available = payload.delivery_available
        applied_immediately.append("delivery_available")

    if payload.service_radius_km is not None:
        pharmacy.service_radius_km = payload.service_radius_km
        applied_immediately.append("service_radius_km")

    # 2. Sensitive fields: create or upsert pending PharmacyChangeRequest
    # A. Phone number change
    current_phone = current_user.phone or (pharmacy.user.phone if pharmacy.user else None)
    if payload.phone and payload.phone != current_phone:
        # Check if already pending request exists for phone
        stmt_cr = select(PharmacyChangeRequest).where(
            PharmacyChangeRequest.pharmacy_id == pharmacy.id,
            PharmacyChangeRequest.field_name == "phone",
            PharmacyChangeRequest.status == ChangeRequestStatus.PENDING,
        )
        existing_cr = (await db.execute(stmt_cr)).scalar_one_or_none()
        if existing_cr:
            existing_cr.old_value = current_phone or "غير محدد"
            existing_cr.new_value = payload.phone
            existing_cr.created_at = datetime.now(timezone.utc)
            existing_cr.admin_notes = None
        else:
            new_cr = PharmacyChangeRequest(
                pharmacy_id=pharmacy.id,
                field_name="phone",
                old_value=current_phone or "غير محدد",
                new_value=payload.phone,
                status=ChangeRequestStatus.PENDING,
            )
            db.add(new_cr)
        queued_for_approval.append("phone")

    # B. Commercial Name change
    if payload.name and payload.name.strip() != pharmacy.name:
        stmt_cr = select(PharmacyChangeRequest).where(
            PharmacyChangeRequest.pharmacy_id == pharmacy.id,
            PharmacyChangeRequest.field_name == "commercial_name",
            PharmacyChangeRequest.status == ChangeRequestStatus.PENDING,
        )
        existing_cr = (await db.execute(stmt_cr)).scalar_one_or_none()
        if existing_cr:
            existing_cr.old_value = pharmacy.name
            existing_cr.new_value = payload.name.strip()
            existing_cr.created_at = datetime.now(timezone.utc)
            existing_cr.admin_notes = None
        else:
            new_cr = PharmacyChangeRequest(
                pharmacy_id=pharmacy.id,
                field_name="commercial_name",
                old_value=pharmacy.name,
                new_value=payload.name.strip(),
                status=ChangeRequestStatus.PENDING,
            )
            db.add(new_cr)
        queued_for_approval.append("commercial_name")

    # C. Address / GPS Coordinates change
    loc_changed = False
    new_addr = payload.address.strip() if payload.address else pharmacy.address
    new_lat = payload.lat if payload.lat is not None else pharmacy.lat
    new_lng = payload.lng if payload.lng is not None else pharmacy.lng

    if (payload.address and payload.address.strip() != pharmacy.address) or \
       (payload.lat is not None and payload.lat != pharmacy.lat) or \
       (payload.lng is not None and payload.lng != pharmacy.lng):
        loc_changed = True

    if loc_changed:
        old_loc_json = json.dumps({
            "address": pharmacy.address,
            "lat": pharmacy.lat,
            "lng": pharmacy.lng,
        }, ensure_ascii=False)
        new_loc_json = json.dumps({
            "address": new_addr,
            "lat": new_lat,
            "lng": new_lng,
        }, ensure_ascii=False)

        stmt_cr = select(PharmacyChangeRequest).where(
            PharmacyChangeRequest.pharmacy_id == pharmacy.id,
            PharmacyChangeRequest.field_name == "address_and_coordinates",
            PharmacyChangeRequest.status == ChangeRequestStatus.PENDING,
        )
        existing_cr = (await db.execute(stmt_cr)).scalar_one_or_none()
        if existing_cr:
            existing_cr.old_value = old_loc_json
            existing_cr.new_value = new_loc_json
            existing_cr.created_at = datetime.now(timezone.utc)
            existing_cr.admin_notes = None
        else:
            new_cr = PharmacyChangeRequest(
                pharmacy_id=pharmacy.id,
                field_name="address_and_coordinates",
                old_value=old_loc_json,
                new_value=new_loc_json,
                status=ChangeRequestStatus.PENDING,
            )
            db.add(new_cr)
        queued_for_approval.append("address_and_coordinates")

    await db.commit()

    # Compose response message
    messages = []
    if applied_immediately:
        messages.append("تم تحديث البيانات التشغيلية بنجاح.")
    if queued_for_approval:
        messages.append("تم إرسال طلب تعديل البيانات الحساسة (الهاتف/الموقع/الاسم) إلى المشرف للمراجعة والاعتماد.")

    return {
        "status": "success",
        "message": " ".join(messages) if messages else "لم يتم تغيير أي بيانات.",
        "applied_immediately": applied_immediately,
        "queued_for_approval": queued_for_approval,
    }


@router.get("/my-change-requests", response_model=List[PharmacyChangeRequestOut])
async def list_my_change_requests(
    current_user: User = Depends(require_role([UserRole.PHARMACY])),
    db: AsyncSession = Depends(get_db),
):
    """List all profile change requests history for authenticated pharmacy."""
    pharmacy_stmt = select(Pharmacy).where(Pharmacy.user_id == current_user.id)
    res = await db.execute(pharmacy_stmt)
    pharmacy = res.scalar_one_or_none()
    if not pharmacy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="لا يوجد ملف صيدلية مرتبط بهذا الحساب",
        )

    stmt = (
        select(PharmacyChangeRequest)
        .options(selectinload(PharmacyChangeRequest.reviewed_by))
        .where(PharmacyChangeRequest.pharmacy_id == pharmacy.id)
        .order_by(desc(PharmacyChangeRequest.created_at))
    )
    result = await db.execute(stmt)
    crs = result.scalars().all()

    return [
        PharmacyChangeRequestOut(
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
            reviewed_by_name=cr.reviewed_by.name if cr.reviewed_by else None,
        )
        for cr in crs
    ]


@router.get("/active-orders-guard")
async def active_orders_guard_test(
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
):
    """Test endpoint guarded by get_current_verified_pharmacy."""
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
