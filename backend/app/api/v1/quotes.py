from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_verified_pharmacy, get_db
from app.core.websocket_manager import ws_manager
from app.models.base import QuoteStatus, RequestStatus
from app.models.pharmacy import Pharmacy
from app.models.quote import PharmacyQuote, QuoteItem
from app.models.request import DrugItem, PrescriptionRequest
from app.models.user import User
from app.schemas.quotes import (
    PharmacyQuoteCreate,
    PharmacyQuoteOut,
    QuoteItemOut,
)
from app.schemas.requests import DrugItemOut, NearbyRequestForPharmacy
from app.services.geo import haversine_distance_km

router = APIRouter()


@router.get("/incoming-requests", response_model=List[NearbyRequestForPharmacy])
async def get_incoming_requests_for_pharmacy(
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch all active prescription requests within this verified pharmacy's service coverage area.
    Calculates distance and indicates whether this pharmacy has already submitted a quote.
    """
    stmt = (
        select(PrescriptionRequest)
        .options(
            selectinload(PrescriptionRequest.items),
            selectinload(PrescriptionRequest.patient),
            selectinload(PrescriptionRequest.quotes),
        )
        .where(PrescriptionRequest.status.in_([RequestStatus.PENDING, RequestStatus.ACTIVE]))
        .order_by(PrescriptionRequest.created_at.desc())
    )
    result = await db.execute(stmt)
    all_requests = result.scalars().all()

    incoming: List[NearbyRequestForPharmacy] = []
    for req in all_requests:
        dist = haversine_distance_km(req.lat, req.lng, pharmacy.lat, pharmacy.lng)
        if dist <= pharmacy.service_radius_km:
            my_quote = next((q for q in req.quotes if q.pharmacy_id == pharmacy.id), None)
            incoming.append(
                NearbyRequestForPharmacy(
                    id=req.id,
                    patient_name=req.patient.name,
                    status=req.status,
                    delivery_preference=req.delivery_preference,
                    location_label=req.location_label,
                    distance_km=dist,
                    notes=req.notes,
                    created_at=req.created_at,
                    items=[
                        DrugItemOut(
                            id=item.id,
                            request_id=item.request_id,
                            drug_name=item.drug_name,
                            dosage=item.dosage,
                            quantity=item.quantity,
                            notes=item.notes,
                        )
                        for item in req.items
                    ],
                    has_my_quote=my_quote is not None,
                    my_quote_id=my_quote.id if my_quote else None,
                )
            )

    # Closest requests first
    incoming.sort(key=lambda x: x.distance_km)
    return incoming


@router.post("", response_model=PharmacyQuoteOut)
async def submit_or_update_quote(
    payload: PharmacyQuoteCreate,
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a price and availability quote for a request.
    Duplicate handling: If a quote from this pharmacy for this request already exists in 'submitted' status,
    this endpoint automatically updates (upserts) the existing quote instead of creating duplicates.
    Pushes real-time WebSocket alert to the patient.
    """
    # 1. Fetch request
    req_stmt = (
        select(PrescriptionRequest)
        .options(selectinload(PrescriptionRequest.patient), selectinload(PrescriptionRequest.items))
        .where(PrescriptionRequest.id == payload.request_id)
    )
    req_res = await db.execute(req_stmt)
    prescription_request = req_res.scalar_one_or_none()

    if not prescription_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="الطلب غير موجود")

    if prescription_request.status not in [RequestStatus.PENDING, RequestStatus.ACTIVE]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="لا يمكن تقديم عروض لهذا الطلب لأنه لم يعد متاحاً لاستقبال عروض جديدة.",
        )

    # 2. Check coverage distance
    dist = haversine_distance_km(
        prescription_request.lat, prescription_request.lng, pharmacy.lat, pharmacy.lng
    )
    if dist > pharmacy.service_radius_km:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"الطلب يقع خارج نطاق تغطية صيدليتك الجغرافي ({dist} كم > {pharmacy.service_radius_km} كم).",
        )

    # 3. Check for existing quote (Duplicate-Quote Handling)
    existing_stmt = (
        select(PharmacyQuote)
        .options(selectinload(PharmacyQuote.items))
        .where(
            PharmacyQuote.request_id == payload.request_id,
            PharmacyQuote.pharmacy_id == pharmacy.id,
        )
    )
    existing_res = await db.execute(existing_stmt)
    existing_quote = existing_res.scalar_one_or_none()

    if existing_quote:
        if existing_quote.status != QuoteStatus.SUBMITTED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="لا يمكن تعديل هذا العرض لأنه تم البت فيه بالفعل (مقبول أو ملغي).",
            )
        # Update existing quote
        quote = existing_quote
        quote.delivery_available = payload.delivery_available
        quote.delivery_fee = payload.delivery_fee if payload.delivery_available else 0.0
        quote.notes = payload.notes
        quote.updated_at = datetime.now(timezone.utc)

        # Clear existing quote items and re-add updated items
        quote.items.clear()
        total_items_price = 0.0
        for qi in payload.items:
            price = qi.price if qi.is_available else 0.0
            total_items_price += price
            quote.items.append(
                QuoteItem(
                    quote_id=quote.id,
                    drug_item_id=qi.drug_item_id,
                    is_available=qi.is_available,
                    price=price,
                    substitute_name=qi.substitute_name,
                    notes=qi.notes,
                )
            )
        quote.total_price = total_items_price + quote.delivery_fee
        event_type = "QUOTE_UPDATED"
    else:
        # Create fresh quote
        total_items_price = sum(qi.price for qi in payload.items if qi.is_available)
        delivery_fee = payload.delivery_fee if payload.delivery_available else 0.0
        total_price = total_items_price + delivery_fee

        quote = PharmacyQuote(
            request_id=payload.request_id,
            pharmacy_id=pharmacy.id,
            status=QuoteStatus.SUBMITTED,
            delivery_available=payload.delivery_available,
            delivery_fee=delivery_fee,
            total_price=total_price,
            notes=payload.notes,
        )
        db.add(quote)
        await db.flush()

        for qi in payload.items:
            price = qi.price if qi.is_available else 0.0
            db.add(
                QuoteItem(
                    quote_id=quote.id,
                    drug_item_id=qi.drug_item_id,
                    is_available=qi.is_available,
                    price=price,
                    substitute_name=qi.substitute_name,
                    notes=qi.notes,
                )
            )
        event_type = "NEW_QUOTE_RECEIVED"

    # Set request to active if it was pending
    if prescription_request.status == RequestStatus.PENDING:
        prescription_request.status = RequestStatus.ACTIVE

    await db.commit()

    # Re-fetch quote with items and pharmacy loaded to prevent MissingGreenlet
    refreshed_quote_stmt = (
        select(PharmacyQuote)
        .options(
            selectinload(PharmacyQuote.items),
            selectinload(PharmacyQuote.pharmacy).selectinload(Pharmacy.user),
        )
        .where(PharmacyQuote.id == quote.id)
    )
    refreshed_quote_res = await db.execute(refreshed_quote_stmt)
    quote = refreshed_quote_res.scalar_one()

    # Push real-time alert to patient
    await ws_manager.send_to_user(
        user_id=prescription_request.patient_id,
        event_type=event_type,
        data={
            "request_id": str(prescription_request.id),
            "pharmacy_name": pharmacy.name,
            "total_price": quote.total_price,
            "distance_km": dist,
            "delivery_available": quote.delivery_available,
        },
    )

    # Format output
    return PharmacyQuoteOut(
        id=quote.id,
        request_id=quote.request_id,
        pharmacy_id=quote.pharmacy_id,
        pharmacy_name=pharmacy.name,
        pharmacy_address=pharmacy.address,
        pharmacy_phone=pharmacy.user.phone if pharmacy.user else None,
        distance_km=dist,
        status=quote.status,
        delivery_available=quote.delivery_available,
        delivery_fee=quote.delivery_fee,
        total_price=quote.total_price,
        notes=quote.notes,
        rejection_reason=quote.rejection_reason,
        created_at=quote.created_at,
        updated_at=quote.updated_at,
        items=[
            QuoteItemOut(
                id=qi.id,
                drug_item_id=qi.drug_item_id,
                is_available=qi.is_available,
                price=qi.price,
                substitute_name=qi.substitute_name,
                notes=qi.notes,
            )
            for qi in quote.items
        ],
    )


@router.get("/my", response_model=List[PharmacyQuoteOut])
async def get_my_quotes(
    pharmacy: Pharmacy = Depends(get_current_verified_pharmacy),
    db: AsyncSession = Depends(get_db),
):
    """List all quotes submitted by the current pharmacy."""
    stmt = (
        select(PharmacyQuote)
        .options(
            selectinload(PharmacyQuote.items).selectinload(QuoteItem.drug_item),
            selectinload(PharmacyQuote.request),
        )
        .where(PharmacyQuote.pharmacy_id == pharmacy.id)
        .order_by(PharmacyQuote.created_at.desc())
    )
    res = await db.execute(stmt)
    quotes = res.scalars().all()

    output = []
    for q in quotes:
        dist = (
            haversine_distance_km(q.request.lat, q.request.lng, pharmacy.lat, pharmacy.lng)
            if q.request
            else None
        )
        output.append(
            PharmacyQuoteOut(
                id=q.id,
                request_id=q.request_id,
                pharmacy_id=q.pharmacy_id,
                pharmacy_name=pharmacy.name,
                pharmacy_address=pharmacy.address,
                pharmacy_phone=pharmacy.user.phone if pharmacy.user else None,
                distance_km=dist,
                status=q.status,
                delivery_available=q.delivery_available,
                delivery_fee=q.delivery_fee,
                total_price=q.total_price,
                notes=q.notes,
                rejection_reason=q.rejection_reason,
                created_at=q.created_at,
                updated_at=q.updated_at,
                items=[
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
                ],
            )
        )
    return output
