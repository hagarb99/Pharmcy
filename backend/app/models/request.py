import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import DeliveryPreference, RequestStatus

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.quote import PharmacyQuote
    from app.models.user import User


class PrescriptionRequest(Base):
    __tablename__ = "prescription_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[RequestStatus] = mapped_column(
        Enum(RequestStatus, name="request_status_enum"),
        default=RequestStatus.PENDING,
        nullable=False,
        index=True,
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    lng: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    location_label: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_preference: Mapped[DeliveryPreference] = mapped_column(
        Enum(DeliveryPreference, name="delivery_preference_enum"),
        default=DeliveryPreference.ANY,
        nullable=False,
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prescription_image_filename: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    patient: Mapped["User"] = relationship("User")
    items: Mapped[List["DrugItem"]] = relationship(
        "DrugItem", back_populates="request", cascade="all, delete-orphan"
    )
    quotes: Mapped[List["PharmacyQuote"]] = relationship(
        "PharmacyQuote", back_populates="request", cascade="all, delete-orphan"
    )
    order: Mapped[Optional["Order"]] = relationship(
        "Order", back_populates="request", uselist=False
    )


class DrugItem(Base):
    __tablename__ = "drug_items"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prescription_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drug_name: Mapped[str] = mapped_column(String(150), nullable=False)
    dosage: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    request: Mapped["PrescriptionRequest"] = relationship(
        "PrescriptionRequest", back_populates="items"
    )
