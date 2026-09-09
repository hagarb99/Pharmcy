import uuid
from typing import Optional

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.pharmacy import PharmacyCreate, PharmacyRead
from app.schemas.user import UserCreate, UserRead, validate_egyptian_phone


class LoginRequest(BaseModel):
    identifier: str  # Email or Phone
    password: str


class PatientRegisterRequest(UserCreate):
    pass


class PharmacyRegisterRequest(BaseModel):
    # Representative account fields
    representative_name: str
    email: EmailStr
    phone: str
    password: str

    # Pharmacy facility fields
    pharmacy_name: str
    address: str
    license_number: str
    lat: float
    lng: float
    service_radius_km: float = 5.0
    delivery_available: bool = False

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str) -> str:
        return validate_egyptian_phone(v)

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("كلمة المرور يجب أن تكون 6 أحرف على الأقل")
        return v


class OTPVerifyRequest(BaseModel):
    identifier: str
    code: str

    @field_validator("code")
    @classmethod
    def check_code(cls, v: str) -> str:
        clean = v.strip()
        if not clean.isdigit() or len(clean) != 6:
            raise ValueError("رمز التحقق يجب أن يتكون من 6 أرقام")
        return clean


class ResendOTPRequest(BaseModel):
    identifier: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead
    pharmacy: Optional[PharmacyRead] = None


class RegisterResponse(BaseModel):
    message: str
    identifier: str
    requires_otp: bool = True
    is_re_registration: bool = False
