import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.base import QuoteStatus


class QuoteItemCreate(BaseModel):
    drug_item_id: uuid.UUID
    is_available: bool = True
    price: float = Field(..., ge=0.0, description="سعر الصنف بالجنيه المصري")
    substitute_name: Optional[str] = Field(None, description="اسم البديل المقترح إن لم يتوفر الأصلي")
    notes: Optional[str] = None


class QuoteItemOut(BaseModel):
    id: uuid.UUID
    drug_item_id: uuid.UUID
    drug_name: Optional[str] = None
    is_available: bool
    price: float
    substitute_name: Optional[str]
    notes: Optional[str]

    model_config = {"from_attributes": True}


class PharmacyQuoteCreate(BaseModel):
    request_id: uuid.UUID
    items: List[QuoteItemCreate] = Field(..., min_length=1, description="تسعيرة وتوفر كل صنف")
    delivery_available: bool = False
    delivery_fee: float = Field(0.0, ge=0.0, description="تكلفة التوصيل إن وجدت")
    notes: Optional[str] = None


class PharmacyQuoteOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    pharmacy_id: uuid.UUID
    pharmacy_name: str
    pharmacy_address: str
    pharmacy_phone: Optional[str] = None
    distance_km: Optional[float] = None
    status: QuoteStatus
    delivery_available: bool
    delivery_fee: float
    total_price: float
    notes: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[QuoteItemOut]

    model_config = {"from_attributes": True}
