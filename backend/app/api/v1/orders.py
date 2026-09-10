from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_active_user, get_db
from app.core.websocket_manager import ws_manager
from app.models.base import OrderStatus, UserRole
from app.models.order import Order
from app.models.pharmacy import Pharmacy
from app.models.user import User
from app.schemas.orders import OrderOut, OrderStatusUpdate

router = APIRouter()


@router.get("", response_model=List[OrderOut])
async def get_my_orders(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List orders for either patient or pharmacy."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.patient),
            selectinload(Order.pharmacy).selectinload(Pharmacy.user),
        )
        .order_by(Order.created_at.desc())
    )

    if current_user.role == UserRole.PATIENT:
        stmt = stmt.where(Order.patient_id == current_user.id)
    elif current_user.role == UserRole.PHARMACY:
        pharmacy = current_user.pharmacy_profile
        if not pharmacy:
            return []
        stmt = stmt.where(Order.pharmacy_id == pharmacy.id)

    res = await db.execute(stmt)
    orders = res.scalars().all()

    return [
        OrderOut(
            id=o.id,
            request_id=o.request_id,
            quote_id=o.quote_id,
            patient_id=o.patient_id,
            patient_name=o.patient.name,
            patient_phone=o.patient.phone,
            pharmacy_id=o.pharmacy_id,
            pharmacy_name=o.pharmacy.name,
            pharmacy_address=o.pharmacy.address,
            pharmacy_phone=o.pharmacy.user.phone if o.pharmacy.user else None,
            status=o.status,
            delivery_option=o.delivery_option,
            items_total=o.items_total,
            delivery_fee=o.delivery_fee,
            total_amount=o.total_amount,
            patient_notes=o.patient_notes,
            created_at=o.created_at,
            updated_at=o.updated_at,
        )
        for o in orders
    ]


@router.get("/{order_id}", response_model=OrderOut)
async def get_order_detail(
    order_id: uuid.UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single order details."""
    stmt = (
        select(Order)
        .options(
            selectinload(Order.patient),
            selectinload(Order.pharmacy).selectinload(Pharmacy.user),
        )
        .where(Order.id == order_id)
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="أمر الشراء غير موجود")

    # Authorization
    is_patient = order.patient_id == current_user.id
    is_pharmacy = (
        current_user.pharmacy_profile and order.pharmacy_id == current_user.pharmacy_profile.id
    )
    if not is_patient and not is_pharmacy and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="غير مصرح لك بالاطلاع على هذا الطلب")

    return OrderOut(
        id=order.id,
        request_id=order.request_id,
        quote_id=order.quote_id,
        patient_id=order.patient_id,
        patient_name=order.patient.name,
        patient_phone=order.patient.phone,
        pharmacy_id=order.pharmacy_id,
        pharmacy_name=order.pharmacy.name,
        pharmacy_address=order.pharmacy.address,
        pharmacy_phone=order.pharmacy.user.phone if order.pharmacy.user else None,
        status=order.status,
        delivery_option=order.delivery_option,
        items_total=order.items_total,
        delivery_fee=order.delivery_fee,
        total_amount=order.total_amount,
        patient_notes=order.patient_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


@router.patch("/{order_id}/status", response_model=OrderOut)
async def update_order_status(
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update order progress status.
    Notifies counterparty immediately via WebSocket.
    """
    stmt = (
        select(Order)
        .options(
            selectinload(Order.patient),
            selectinload(Order.pharmacy).selectinload(Pharmacy.user),
        )
        .where(Order.id == order_id)
        .with_for_update()
    )
    res = await db.execute(stmt)
    order = res.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="أمر الشراء غير موجود")

    # Only participating pharmacy or patient (for cancellation) or admin
    is_pharmacy = (
        current_user.pharmacy_profile and order.pharmacy_id == current_user.pharmacy_profile.id
    )
    is_patient = order.patient_id == current_user.id

    if not is_pharmacy and not is_patient and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="غير مصرح لك بتعديل حالة هذا الطلب")

    # Patient can only cancel if still confirmed
    if is_patient and not is_pharmacy and current_user.role != UserRole.ADMIN:
        if payload.status != OrderStatus.CANCELLED or order.status != OrderStatus.CONFIRMED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="لا يمكن إلغاء الطلب بعد أن بدأت الصيدلية في تجهيزه.",
            )

    # Capture relationship fields before committing session
    target_user_id = order.pharmacy.user_id if is_patient else order.patient_id
    patient_name = order.patient.name
    patient_phone = order.patient.phone
    pharmacy_name = order.pharmacy.name
    pharmacy_address = order.pharmacy.address
    pharmacy_phone = order.pharmacy.user.phone if order.pharmacy.user else None

    order.status = payload.status
    order.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(order)

    # Notify counterpart via WebSocket
    await ws_manager.send_to_user(
        user_id=target_user_id,
        event_type="ORDER_STATUS_CHANGED",
        data={
            "order_id": str(order.id),
            "new_status": order.status.value,
        },
    )

    return OrderOut(
        id=order.id,
        request_id=order.request_id,
        quote_id=order.quote_id,
        patient_id=order.patient_id,
        patient_name=patient_name,
        patient_phone=patient_phone,
        pharmacy_id=order.pharmacy_id,
        pharmacy_name=pharmacy_name,
        pharmacy_address=pharmacy_address,
        pharmacy_phone=pharmacy_phone,
        status=order.status,
        delivery_option=order.delivery_option,
        items_total=order.items_total,
        delivery_fee=order.delivery_fee,
        total_amount=order.total_amount,
        patient_notes=order.patient_notes,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )
