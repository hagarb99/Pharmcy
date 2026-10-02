import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

from app.models.base import ChangeRequestStatus, PharmacyStatus, PharmacyVerificationStatus


class PharmacyChangeRequestOut(BaseModel):
    id: uuid.UUID
    pharmacy_id: uuid.UUID
    pharmacy_name: Optional[str] = None
    pharmacy_license: Optional[str] = None
    field_name: str
    old_value: str
    new_value: str
    status: ChangeRequestStatus
    admin_notes: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by_name: Optional[str] = None

    model_config = {"from_attributes": True}


class ChangeRequestReviewAction(BaseModel):
    admin_notes: Optional[str] = Field(None, description="ملاحظات المشرف أو سبب الرفض")


class PharmacyProfileUpdate(BaseModel):
    # Operational fields (applied immediately)
    delivery_available: Optional[bool] = None
    delivery_fee: Optional[float] = Field(None, ge=0.0)
    service_radius_km: Optional[float] = Field(None, ge=1.0, le=50.0)

    # Sensitive fields (submitted as Change Request pending Admin approval)
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    @field_validator("name", "address", mode="before")
    @classmethod
    def sanitize_strings(cls, v):
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    @field_validator("phone", mode="before")
    @classmethod
    def sanitize_phone(cls, v):
        if v is None:
            return None
        s = str(v).strip().replace(" ", "").replace("-", "")
        return s if s else None


class PharmacyProfileOut(BaseModel):
    id: uuid.UUID
    name: str
    phone: Optional[str] = None
    address: str
    lat: float
    lng: float
    service_radius_km: float
    license_number: str
    verification_status: PharmacyVerificationStatus
    status: PharmacyStatus
    delivery_available: bool
    delivery_fee: float = 0.0
    pending_change_requests: List[PharmacyChangeRequestOut] = []

    model_config = {"from_attributes": True}
