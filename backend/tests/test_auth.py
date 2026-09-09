import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.base import PharmacyVerificationStatus, UserRole
from app.models.user import User


@pytest.mark.asyncio
async def test_patient_registration(client: AsyncClient):
    payload = {
        "name": "أحمد محمود",
        "email": "ahmed@example.com",
        "phone": "+201012345678",
        "password": "SecretPassword123!",
        "lat": 30.0444,
        "lng": 31.2357,
        "location": "وسط البلد، القاهرة",
    }
    response = await client.post(f"{settings.API_V1_STR}/auth/register/patient", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["requires_otp"] is True
    assert data["identifier"] == "+201012345678"
    assert data["is_re_registration"] is False


@pytest.mark.asyncio
async def test_pharmacy_registration(client: AsyncClient):
    payload = {
        "representative_name": "د. هاني شاكر",
        "email": "hani@pharmacy.com",
        "phone": "+201123456789",
        "password": "PharmacyPass123!",
        "pharmacy_name": "صيدلية الشفاء الجديدة",
        "address": "شارع النصر، المعادي، القاهرة",
        "license_number": "PH-CAI-2026-001",
        "lat": 29.9599,
        "lng": 31.2612,
        "service_radius_km": 6.5,
        "delivery_available": True,
    }
    response = await client.post(f"{settings.API_V1_STR}/auth/register/pharmacy", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["requires_otp"] is True
    assert data["identifier"] == "+201123456789"


@pytest.mark.asyncio
async def test_duplicate_license_rejection(client: AsyncClient):
    payload1 = {
        "representative_name": "د. صيدلي 1",
        "email": "doc1@pharmacy.com",
        "phone": "+201211112222",
        "password": "Password123!",
        "pharmacy_name": "صيدلية المستقبل",
        "address": "مدينة نصر",
        "license_number": "DUPLICATE-LIC-123",
        "lat": 30.05,
        "lng": 31.33,
    }
    res1 = await client.post(f"{settings.API_V1_STR}/auth/register/pharmacy", json=payload1)
    assert res1.status_code == 201

    # Attempt to register second pharmacy with identical license number
    payload2 = {
        "representative_name": "د. صيدلي 2",
        "email": "doc2@pharmacy.com",
        "phone": "+201233334444",
        "password": "Password123!",
        "pharmacy_name": "صيدلية الأمل",
        "address": "مصر الجديدة",
        "license_number": "DUPLICATE-LIC-123",
        "lat": 30.09,
        "lng": 31.32,
    }
    res2 = await client.post(f"{settings.API_V1_STR}/auth/register/pharmacy", json=payload2)
    assert res2.status_code == 400
    assert "مسجل مسبقاً" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_login_unverified_account_requires_otp(client: AsyncClient):
    # Register unverified user
    await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "سارة علي",
            "email": "sara@example.com",
            "phone": "+201099887766",
            "password": "UserPass123!",
        },
    )

    # Attempt login before verifying OTP
    login_res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": "+201099887766", "password": "UserPass123!"},
    )
    assert login_res.status_code == 403
    data = login_res.json()["detail"]
    assert data["requires_otp"] is True


@pytest.mark.asyncio
async def test_login_invalid_password(client: AsyncClient, test_admin_user: User):
    res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": test_admin_user.email, "password": "WrongPassword!"},
    )
    assert res.status_code == 401
