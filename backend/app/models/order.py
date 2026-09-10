import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import DeliveryOption, OrderStatus

if TYPE_CHECKING:
    from app.models.pharmacy import Pharmacy
    from app.models.quote import PharmacyQuote
    from app.models.request import PrescriptionRequest
    from app.models.user import User


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Strictly unique: exactly one Order per PrescriptionRequest
    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prescription_requests.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
        index=True,
    )
    # Strictly unique: exactly one Order per accepted PharmacyQuote
    quote_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("pharmacy_quotes.id", ondelete="RESTRICT"),
        unique=True,
        nullable=False,
        index=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pharmacy_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("pharmacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status_enum"),
        default=OrderStatus.CONFIRMED,
        nullable=False,
        index=True,
    )
    delivery_option: Mapped[DeliveryOption] = mapped_column(
        Enum(DeliveryOption, name="delivery_option_enum"),
        default=DeliveryOption.PICKUP,
        nullable=False,
    )
    items_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    patient_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
    request: Mapped["PrescriptionRequest"] = relationship(
        "PrescriptionRequest", back_populates="order"
    )
    quote: Mapped["PharmacyQuote"] = relationship("PharmacyQuote", back_populates="order")
    patient: Mapped["User"] = relationship("User")
    pharmacy: Mapped["Pharmacy"] = relationship("Pharmacy")
