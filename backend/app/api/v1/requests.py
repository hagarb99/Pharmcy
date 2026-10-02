from datetime import datetime, timedelta, timezone
from typing import List
import uuid

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db, require_role
from app.core.config import settings
from app.core.websocket_manager import ws_manager
from app.services.audit_service import AuditService
from app.models.base import (
    DeliveryOption,
    DeliveryPreference,
    OrderStatus,
    PharmacyVerificationStatus,
    QuoteStatus,
    RequestStatus,
    UserRole,
)
from app.models.order import Order
from app.models.pharmacy import Pharmacy
from app.models.quote import PharmacyQuote, QuoteItem
from app.models.request import DrugItem, PrescriptionRequest
from app.models.user import User
from app.schemas.orders import OrderOut, OrderSelectQuote
from app.schemas.quotes import PharmacyQuoteOut, QuoteItemOut
from app.schemas.requests import (
    PrescriptionRequestCreate,
    PrescriptionRequestOut,
)
from app.services.geo import get_nearby_verified_pharmacies, haversine_distance_km

router = APIRouter()


STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "storage" / "prescriptions"


def _calculate_timeout_info(created_at: datetime, quotes_count: int) -> tuple[bool, datetime]:
    timeout_at = created_at + timedelta(minutes=settings.REQUEST_RESPONSE_TIMEOUT_MINUTES)
    has_timed_out = datetime.now(timezone.utc) >= timeout_at and quotes_count == 0
    return has_timed_out, timeout_at


@router.post("", response_model=PrescriptionRequestOut, status_code=status.HTTP_201_CREATED)
async def create_request(
    payload: PrescriptionRequestCreate,
    current_user: User = Depends(require_role([UserRole.PATIENT])),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new prescription / medicine request.
    Supports either manual item entry or uploaded prescription image (or both).
    Automatically captures user coordinates, matches nearby verified pharmacies,
    and broadcasts a real-time WebSocket alert to them.
    """
    if not payload.items and not payload.prescription_image_filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="يجب إدخال صنف دوائي واحد على الأقل أو إرفاق صورة الروشتة الطبية.",
        )

    lat = payload.lat or current_user.lat or 30.0444
    lng = payload.lng or current_user.lng or 31.2357
    loc_label = payload.location_label or current_user.location or "موقعي الحالي"

    new_request = PrescriptionRequest(
        patient_id=current_user.id,
        status=RequestStatus.PENDING,
        lat=lat,
        lng=lng,
        location_label=loc_label,
        delivery_preference=payload.delivery_preference,
        notes=payload.notes,
        prescription_image_filename=payload.prescription_image_filename,
    )
    db.add(new_request)
    await db.flush()

    if payload.items:
        for item_data in payload.items:
            drug_item = DrugItem(
                request_id=new_request.id,
                drug_name=item_data.drug_name.strip(),
                dosage=item_data.dosage.strip() if item_data.dosage else None,
                quantity=item_data.quantity,
                notes=item_data.notes.strip() if item_data.notes else None,
            )
            db.add(drug_item)
    else:
        # Relational fallback item for image-only requests
        fallback_item = DrugItem(
            request_id=new_request.id,
            drug_name="روشتة طبية مصورة (مرفقة بالصورة)",
            dosage=None,
            quantity=1,
            notes="يرجى مراجعة صورة الروشتة الطبية المرفقة لتحديد الأصناف والأسعار",
        )
        db.add(fallback_item)

    await db.commit()

    # Re-fetch with items loaded
    stmt = (
        select(PrescriptionRequest)
        .options(selectinload(PrescriptionRequest.items))
        .where(PrescriptionRequest.id == new_request.id)
    )
    res = await db.execute(stmt)
    saved_request = res.scalar_one()

    # Find nearby pharmacies and push real-time WebSocket notification
    nearby = await get_nearby_verified_pharmacies(db, lat, lng)
    target_user_ids = [ph.user_id for ph, _ in nearby]
    if target_user_ids:
        await ws_manager.broadcast_to_users(
            user_ids=target_user_ids,
            event_type="NEW_INCOMING_REQUEST",
            data={
                "request_id": str(saved_request.id),
                "patient_name": current_user.name,
                "location_label": loc_label,
                "items_count": len(saved_request.items),
                "delivery_preference": saved_request.delivery_preference.value,
                "has_prescription_image": bool(saved_request.prescription_image_filename),
            },
        )

    has_timed_out, timeout_at = _calculate_timeout_info(saved_request.created_at, 0)

    return PrescriptionRequestOut(
        id=saved_request.id,
        patient_id=saved_request.patient_id,
        status=saved_request.status,
        lat=saved_request.lat,
        lng=saved_request.lng,
        location_label=saved_request.location_label,
        delivery_preference=saved_request.delivery_preference,
        notes=saved_request.notes,
        prescription_image_filename=saved_request.prescription_image_filename,
        has_prescription_image=bool(saved_request.prescription_image_filename),
        created_at=saved_request.created_at,
        updated_at=saved_request.updated_at,
        items=saved_request.items,
        quotes_count=0,
        has_timed_out=has_timed_out,
        timeout_at=timeout_at,
    )


@router.get("/my", response_model=List[PrescriptionRequestOut])
async def get_my_requests(
    current_user: User = Depends(require_role([UserRole.PATIENT])),
    db: AsyncSession = Depends(get_db),
):
    """List all requests created by the authenticated patient with quote counts and timeout status."""
    stmt = (
        select(PrescriptionRequest)
        .options(
            selectinload(PrescriptionRequest.items),
            selectinload(PrescriptionRequest.quotes),
        )
        .where(PrescriptionRequest.patient_id == current_user.id)
        .order_by(PrescriptionRequest.created_at.desc())
    )
    result = await db.execute(stmt)
    requests = result.scalars().all()

    output = []
    for req in requests:
        q_count = len(req.quotes)
        has_timed_out, timeout_at = _calculate_timeout_info(req.created_at, q_count)
        output.append(
            PrescriptionRequestOut(
                id=req.id,
                patient_id=req.patient_id,
                status=req.status,
                lat=req.lat,
                lng=req.lng,
                location_label=req.location_label,
                delivery_preference=req.delivery_preference,
                notes=req.notes,
                prescription_image_filename=req.prescription_image_filename,
                has_prescription_image=bool(req.prescription_image_filename),
                created_at=req.created_at,
                updated_at=req.updated_at,
                items=req.items,
                quotes_count=q_count,
                has_timed_out=has_timed_out,
                timeout_at=timeout_at,
            )
        )
    return output


@router.get("/{request_id}")
async def get_request_detail(
    request_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get detailed request information including items and all quotes received.
    Authorized for the requesting patient and participating pharmacies.
    """
    stmt = (
        select(PrescriptionRequest)
        .options(
            selectinload(PrescriptionRequest.items),
            selectinload(PrescriptionRequest.quotes).selectinload(PharmacyQuote.pharmacy).selectinload(Pharmacy.user),
            selectinload(PrescriptionRequest.quotes).selectinload(PharmacyQuote.items).selectinload(QuoteItem.drug_item),
            selectinload(PrescriptionRequest.order),
        )
        .where(PrescriptionRequest.id == request_id)
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطلب غير موجود")

    # Authorization check
    if current_user.role == UserRole.PATIENT and req.patient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="غير مصرح لك بالاطلاع على هذا الطلب")

    # Format quotes list with calculated distance
    quotes_out = []
    for q in req.quotes:
        dist = haversine_distance_km(req.lat, req.lng, q.pharmacy.lat, q.pharmacy.lng)
        items_out = [
            QuoteItemOut(
                id=qi.id,
                drug_item_id=qi.drug_item_id,
                drug_name=qi.drug_item.drug_name if qi.drug_item else None,
                is_available=qi.is_available,
                price=qi.price,
                substitute_name=qi.substitute_name,
                notes=qi.notes,
            )
            for qi in q.items
        ]
        quotes_out.append(
            PharmacyQuoteOut(
                id=q.id,
                request_id=q.request_id,
                pharmacy_id=q.pharmacy_id,
                pharmacy_name=q.pharmacy.name,
                pharmacy_address=q.pharmacy.address,
                pharmacy_phone=q.pharmacy.user.phone if q.pharmacy.user else None,
                distance_km=dist,
                status=q.status,
                delivery_available=q.delivery_available,
                delivery_fee=q.delivery_fee,
                total_price=q.total_price,
                notes=q.notes,
                rejection_reason=q.rejection_reason,
                created_at=q.created_at,
                updated_at=q.updated_at,
                items=items_out,
            )
        )

    has_timed_out, timeout_at = _calculate_timeout_info(req.created_at, len(quotes_out))

    return {
        "id": req.id,
        "patient_id": req.patient_id,
        "status": req.status,
        "lat": req.lat,
        "lng": req.lng,
        "location_label": req.location_label,
        "delivery_preference": req.delivery_preference,
        "notes": req.notes,
        "prescription_image_filename": req.prescription_image_filename,
        "has_prescription_image": bool(req.prescription_image_filename),
        "created_at": req.created_at,
        "updated_at": req.updated_at,
        "items": req.items,
        "quotes": quotes_out,
        "has_timed_out": has_timed_out,
        "timeout_at": timeout_at,
        "order_id": req.order.id if req.order else None,
    }


@router.get("/{request_id}/prescription-image")
async def get_prescription_image(
    request_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Securely stream the prescription image file for an authorized requester.
    Strictly restricted to:
    1. The patient who created the request.
    2. A verified pharmacy within the request's service radius or with a quote.
    3. An administrator.
    Every access is logged in the AuditLog trail for medical data compliance (FR-29, NFR-02).
    """
    stmt = (
        select(PrescriptionRequest)
        .options(selectinload(PrescriptionRequest.quotes))
        .where(PrescriptionRequest.id == request_id)
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطلب غير موجود")

    if not req.prescription_image_filename:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="لا توجد صورة روشتة مرفقة لهذا الطلب")

    # Authorization Check
    is_authorized = False
    details_context = {"role": current_user.role.value, "request_id": str(request_id)}

    if current_user.role == UserRole.ADMIN:
        is_authorized = True
    elif current_user.role == UserRole.PATIENT:
        if req.patient_id == current_user.id:
            is_authorized = True
    elif current_user.role == UserRole.PHARMACY:
        p_stmt = select(Pharmacy).where(Pharmacy.user_id == current_user.id)
        p_res = await db.execute(p_stmt)
        pharmacy = p_res.scalar_one_or_none()
        if pharmacy and pharmacy.verification_status == PharmacyVerificationStatus.VERIFIED:
            has_quote = any(q.pharmacy_id == pharmacy.id for q in req.quotes)
            dist = haversine_distance_km(req.lat, req.lng, pharmacy.lat, pharmacy.lng)
            if has_quote or dist <= pharmacy.service_radius_km:
                is_authorized = True
                details_context["pharmacy_id"] = str(pharmacy.id)
                details_context["pharmacy_name"] = pharmacy.name

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="غير مصرح لك بالاطلاع على صورة الروشتة الطبية لهذا الطلب",
        )

    # Mandatory Audit Log for health data access (FR-29, NFR-02)
    await AuditService.log_event(
        db=db,
        action="PRESCRIPTION_IMAGE_VIEWED",
        target=f"request:{req.id}",
        user_id=current_user.id,
        ip=request.client.host if request.client else None,
        metadata_json=details_context,
    )

    file_path = STORAGE_DIR / req.prescription_image_filename
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="ملف الروشتة غير موجود على الخادم")

    return FileResponse(
        path=str(file_path),
        headers={"Cache-Control": "private, no-store, must-revalidate"},
    )


@router.post("/{request_id}/select-quote", response_model=OrderOut)
async def select_quote_and_create_order(
    request_id: uuid.UUID,
    payload: OrderSelectQuote,
    current_user: User = Depends(require_role([UserRole.PATIENT])),
    db: AsyncSession = Depends(get_db),
):
    """
    Atomic quote selection:
    1. Locks request row to prevent race conditions.
    2. Validates request is selectable (pending or active).
    3. Accepts winning quote.
    4. Automatically rejects competing submitted quotes with reason.
    5. Creates Order with unique constraint protection.
    6. Dispatches real-time WebSocket notifications.
    """
    # 1. Row-level lock to prevent double-accept race conditions
    stmt = (
        select(PrescriptionRequest)
        .where(PrescriptionRequest.id == request_id)
        .with_for_update()
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطلب غير موجود")

    if req.patient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="غير مصرح لك باختيار عرض لهذا الطلب")

    # 2. Status validity check
    if req.status in [RequestStatus.ORDERED, RequestStatus.COMPLETED]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="تم قبول عرض مسبقاً وتأكيد هذا الطلب بالفعل.",
        )
    if req.status == RequestStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن اختيار عرض لطلب تم إلغاؤه.",
        )

    # 3. Fetch winning quote
    quote_stmt = (
        select(PharmacyQuote)
        .options(
            selectinload(PharmacyQuote.pharmacy).selectinload(Pharmacy.user),
            selectinload(PharmacyQuote.items),
        )
        .where(PharmacyQuote.id == payload.quote_id, PharmacyQuote.request_id == request_id)
    )
    quote_res = await db.execute(quote_stmt)
    winning_quote = quote_res.scalar_one_or_none()

    if not winning_quote:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="عرض السعر غير موجود لهذا الطلب")

    if winning_quote.status != QuoteStatus.SUBMITTED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="عرض السعر المختار لم يعد متاحاً للقبول.",
        )

    # Validate delivery options
    if payload.delivery_option == DeliveryOption.DELIVERY and not winning_quote.delivery_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="هذه الصيدلية لا توفر خدمة التوصيل لهذا العرض، يرجى اختيار الاستلام من الصيدلية.",
        )

    # 4. Accept winning quote
    winning_quote.status = QuoteStatus.ACCEPTED

    # 5. Auto-close competing submitted quotes
    competing_stmt = (
        select(PharmacyQuote)
        .options(selectinload(PharmacyQuote.pharmacy))
        .where(
            PharmacyQuote.request_id == request_id,
            PharmacyQuote.id != winning_quote.id,
            PharmacyQuote.status == QuoteStatus.SUBMITTED,
        )
    )
    competing_res = await db.execute(competing_stmt)
    losing_quotes = competing_res.scalars().all()

    losing_pharmacy_user_ids = []
    for lq in losing_quotes:
        lq.status = QuoteStatus.REJECTED
        lq.rejection_reason = "تم اختيار عرض صيدلية أخرى من قبل المريض"
        if lq.pharmacy:
            losing_pharmacy_user_ids.append(lq.pharmacy.user_id)

    # 6. Calculate totals and create Order
    items_total = sum(item.price for item in winning_quote.items if item.is_available)
    delivery_fee = (
        winning_quote.delivery_fee if payload.delivery_option == DeliveryOption.DELIVERY else 0.0
    )
    total_amount = items_total + delivery_fee

    new_order = Order(
        request_id=req.id,
        quote_id=winning_quote.id,
        patient_id=current_user.id,
        pharmacy_id=winning_quote.pharmacy_id,
        status=OrderStatus.CONFIRMED,
        delivery_option=payload.delivery_option,
        items_total=items_total,
        delivery_fee=delivery_fee,
        total_amount=total_amount,
        patient_notes=payload.patient_notes,
    )
    # Capture all required values before committing session
    pharmacy_user_id = winning_quote.pharmacy.user_id
    pharmacy_name = winning_quote.pharmacy.name
    pharmacy_address = winning_quote.pharmacy.address
    pharmacy_phone = winning_quote.pharmacy.user.phone if winning_quote.pharmacy.user else None
    patient_name = current_user.name
    patient_phone = current_user.phone

    db.add(new_order)

    # Transition request status
    req.status = RequestStatus.ORDERED
    await db.commit()
    await db.refresh(new_order)

    # 7. Push real-time WebSocket notifications
    # Winning pharmacy alert
    await ws_manager.send_to_user(
        user_id=pharmacy_user_id,
        event_type="ORDER_CONFIRMED",
        data={
            "order_id": str(new_order.id),
            "patient_name": patient_name,
            "patient_phone": patient_phone,
            "total_amount": total_amount,
            "delivery_option": payload.delivery_option.value,
        },
    )

    # Notify losing pharmacies about quote closure
    if losing_pharmacy_user_ids:
        await ws_manager.broadcast_to_users(
            user_ids=losing_pharmacy_user_ids,
            event_type="QUOTE_CLOSED",
            data={
                "request_id": str(req.id),
                "message": "تم اختيار عرض صيدلية أخرى لهذا الطلب.",
            },
        )

    # Return Order response
    return OrderOut(
        id=new_order.id,
        request_id=new_order.request_id,
        quote_id=new_order.quote_id,
        patient_id=new_order.patient_id,
        patient_name=patient_name,
        patient_phone=patient_phone,
        pharmacy_id=new_order.pharmacy_id,
        pharmacy_name=pharmacy_name,
        pharmacy_address=pharmacy_address,
        pharmacy_phone=pharmacy_phone,
        status=new_order.status,
        delivery_option=new_order.delivery_option,
        items_total=new_order.items_total,
        delivery_fee=new_order.delivery_fee,
        total_amount=new_order.total_amount,
        patient_notes=new_order.patient_notes,
        created_at=new_order.created_at,
        updated_at=new_order.updated_at,
    )


@router.post("/{request_id}/cancel")
async def cancel_request(
    request_id: uuid.UUID,
    current_user: User = Depends(require_role([UserRole.PATIENT])),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an active request by the patient."""
    stmt = (
        select(PrescriptionRequest)
        .options(selectinload(PrescriptionRequest.quotes))
        .where(PrescriptionRequest.id == request_id)
        .with_for_update()
    )
    res = await db.execute(stmt)
    req = res.scalar_one_or_none()

    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطلب غير موجود")

    if req.patient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="غير مصرح لك بإلغاء هذا الطلب")

    if req.status in [RequestStatus.ORDERED, RequestStatus.COMPLETED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن إلغاء الطلب بعد تأكيد الشراء، يرجى التواصل مع الصيدلية مباشرة.",
        )

    req.status = RequestStatus.CANCELLED
    for q in req.quotes:
        if q.status == QuoteStatus.SUBMITTED:
            q.status = QuoteStatus.EXPIRED
            q.rejection_reason = "تم إلغاء الطلب من قبل المريض"

    await db.commit()
    return {"message": "تم إلغاء الطلب بنجاح"}
