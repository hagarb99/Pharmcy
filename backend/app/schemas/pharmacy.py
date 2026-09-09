import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.base import PharmacyStatus, PharmacyVerificationStatus
from app.schemas.user import UserRead


class PharmacyBase(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    service_radius_km: float = 5.0
    delivery_available: bool = False

    @field_validator("service_radius_km")
    @classmethod
    def check_radius(cls, v: float) -> float:
        if v <= 0 or v > 50:
            raise ValueError("نطاق الخدمة يجب أن يكون بين 0.1 و 50 كم")
        return v


class PharmacyCreate(PharmacyBase):
    license_number: str

    @field_validator("license_number")
    @classmethod
    def check_license(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 3:
            raise ValueError("رقم الترخيص يجب أن يتكون من 3 خانات على الأقل")
        return clean


class PharmacyRead(PharmacyBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    license_number: str
    verification_status: PharmacyVerificationStatus
    status: PharmacyStatus
    rejection_reason: Optional[str] = None
    created_at: datetime
    user: Optional[UserRead] = None


class PharmacyVerificationAction(BaseModel):
    action: str  # "approve" or "reject"
    reason: Optional[str] = None

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        v_lower = v.lower().strip()
        if v_lower not in ["approve", "reject"]:
            raise ValueError("الإجراء يجب أن يكون 'approve' أو 'reject'")
        return v_lower
