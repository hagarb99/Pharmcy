import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.models.base import DeliveryOption, OrderStatus


class OrderSelectQuote(BaseModel):
    quote_id: uuid.UUID = Field(..., description="معرّف العرض الذي تم اختياره")
    delivery_option: DeliveryOption = Field(DeliveryOption.PICKUP, description="طريقة الاستلام")
    patient_notes: Optional[str] = Field(None, description="ملاحظات المريض للصيدلية")


class OrderStatusUpdate(BaseModel):
    status: OrderStatus = Field(..., description="الحالة الجديدة للطلب")


class OrderOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    quote_id: uuid.UUID
    patient_id: uuid.UUID
    patient_name: str
    patient_phone: str
    pharmacy_id: uuid.UUID
    pharmacy_name: str
    pharmacy_address: str
    pharmacy_phone: Optional[str] = None
    status: OrderStatus
    delivery_option: DeliveryOption
    items_total: float
    delivery_fee: float
    total_amount: float
    patient_notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
