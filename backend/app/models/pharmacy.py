import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import PharmacyStatus, PharmacyVerificationStatus

if TYPE_CHECKING:
    from app.models.user import User


class Pharmacy(Base):
    __tablename__ = "pharmacies"

    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    lng: Mapped[float] = mapped_column(Float, nullable=False, index=True)
    service_radius_km: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    license_number: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    verification_status: Mapped[PharmacyVerificationStatus] = mapped_column(
        Enum(PharmacyVerificationStatus, name="pharmacy_verification_status_enum"),
        default=PharmacyVerificationStatus.PENDING,
        nullable=False,
    )
    status: Mapped[PharmacyStatus] = mapped_column(
        Enum(PharmacyStatus, name="pharmacy_status_enum"),
        default=PharmacyStatus.ACTIVE,
        nullable=False,
    )
    delivery_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="pharmacy_profile")
