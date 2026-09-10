import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import QuoteStatus

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.pharmacy import Pharmacy
    from app.models.request import DrugItem, PrescriptionRequest


class PharmacyQuote(Base):
    __tablename__ = "pharmacy_quotes"
    __table_args__ = (
        UniqueConstraint("request_id", "pharmacy_id", name="uq_request_pharmacy_quote"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("prescription_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    pharmacy_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("pharmacies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[QuoteStatus] = mapped_column(
        Enum(QuoteStatus, name="quote_status_enum"),
        default=QuoteStatus.SUBMITTED,
        nullable=False,
        index=True,
    )
    delivery_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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
        "PrescriptionRequest", back_populates="quotes"
    )
    pharmacy: Mapped["Pharmacy"] = relationship("Pharmacy")
    items: Mapped[List["QuoteItem"]] = relationship(
        "QuoteItem", back_populates="quote", cascade="all, delete-orphan"
    )
    order: Mapped[Optional["Order"]] = relationship(
        "Order", back_populates="quote", uselist=False
    )


class QuoteItem(Base):
    __tablename__ = "quote_items"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    quote_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("pharmacy_quotes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drug_item_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("drug_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    substitute_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    quote: Mapped["PharmacyQuote"] = relationship("PharmacyQuote", back_populates="items")
    drug_item: Mapped["DrugItem"] = relationship("DrugItem")
