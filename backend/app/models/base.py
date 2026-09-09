import enum
from app.core.database import Base

__all__ = [
    "Base",
    "UserRole",
    "PharmacyVerificationStatus",
    "PharmacyStatus",
]


class UserRole(str, enum.Enum):
    PATIENT = "patient"
    PHARMACY = "pharmacy"
    ADMIN = "admin"


class PharmacyVerificationStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PharmacyStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    INACTIVE = "inactive"
