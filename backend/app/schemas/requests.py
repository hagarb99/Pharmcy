import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

from app.models.base import DeliveryPreference, RequestStatus


class DrugItemCreate(BaseModel):
    drug_name: str = Field(..., min_length=2, max_length=150, description="اسم الدواء المطلوب")
    dosage: Optional[str] = Field(None, max_length=80, description="التركيز أو الشكل الصيدلي")
    quantity: int = Field(1, ge=1, le=100, description="الكمية المطلوبة")
    notes: Optional[str] = Field(None, description="أي ملاحظات خاصة بالصنف")


class DrugItemOut(BaseModel):
    id: uuid.UUID
    request_id: uuid.UUID
    drug_name: str
    dosage: Optional[str]
    quantity: int
    notes: Optional[str]

    model_config = {"from_attributes": True}


class PrescriptionRequestCreate(BaseModel):
    items: List[DrugItemCreate] = Field(default_factory=list, description="قائمة الأدوية المطلوبة")
    prescription_image_filename: Optional[str] = Field(None, description="اسم ملف صورة الروشتة المرفوعة")
    lat: Optional[float] = Field(None, description="خط العرض لموقع الطلب")
    lng: Optional[float] = Field(None, description="خط الطول لموقع الطلب")
    location_label: Optional[str] = Field(None, description="اسم الحي أو المنطقة")
    delivery_preference: DeliveryPreference = DeliveryPreference.ANY
    notes: Optional[str] = None


class PrescriptionRequestOut(BaseModel):
    id: uuid.UUID
    patient_id: uuid.UUID
    status: RequestStatus
    lat: float
    lng: float
    location_label: Optional[str]
    delivery_preference: DeliveryPreference
    notes: Optional[str]
    prescription_image_filename: Optional[str] = None
    has_prescription_image: bool = False
    created_at: datetime
    updated_at: datetime
    items: List[DrugItemOut]
    quotes_count: int = 0
    has_timed_out: bool = False
    timeout_at: datetime

    model_config = {"from_attributes": True}


class NearbyRequestForPharmacy(BaseModel):
    id: uuid.UUID
    patient_name: str
    status: RequestStatus
    delivery_preference: DeliveryPreference
    location_label: Optional[str]
    distance_km: float
    notes: Optional[str]
    prescription_image_filename: Optional[str] = None
    has_prescription_image: bool = False
    created_at: datetime
    items: List[DrugItemOut]
    has_my_quote: bool = False
    my_quote_id: Optional[uuid.UUID] = None

    model_config = {"from_attributes": True}
