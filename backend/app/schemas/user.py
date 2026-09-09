import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

from app.models.base import UserRole


def validate_egyptian_phone(v: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", v)
    # Match +201..., 00201..., 01... with 11 digits total (for 01) or 13 digits (for +201)
    if not re.match(r"^(\+201|00201|201|01)[0125][0-9]{8}$", cleaned):
        raise ValueError("رقم الهاتف يجب أن يكون رقم مصري صالح (مثال: 01012345678 أو +201012345678)")
    return cleaned


class UserBase(BaseModel):
    name: str
    email: EmailStr
    phone: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_egyptian_phone(v)


class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.PATIENT

    @field_validator("password")
    @classmethod
    def check_password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
        return v


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Optional[str] = None


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    phone: str
    role: UserRole
    lat: Optional[float] = None
    lng: Optional[float] = None
    location: Optional[str] = None
    is_verified: bool
    is_active: bool
    created_at: datetime
