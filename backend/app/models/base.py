import enum
from app.core.database import Base

__all__ = [
    "Base",
    "UserRole",
    "PharmacyVerificationStatus",
    "PharmacyStatus",
    "RequestStatus",
    "DeliveryPreference",
    "QuoteStatus",
    "OrderStatus",
    "DeliveryOption",
    "ChangeRequestStatus",
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


class RequestStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    ORDERED = "ordered"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class DeliveryPreference(str, enum.Enum):
    PICKUP_ONLY = "pickup_only"
    DELIVERY_PREFERRED = "delivery_preferred"
    ANY = "any"


class QuoteStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class OrderStatus(str, enum.Enum):
    CONFIRMED = "confirmed"
    IN_PREPARATION = "in_preparation"
    READY_FOR_PICKUP = "ready_for_pickup"
    OUT_FOR_DELIVERY = "out_for_delivery"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class DeliveryOption(str, enum.Enum):
    PICKUP = "pickup"
    DELIVERY = "delivery"


class ChangeRequestStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
