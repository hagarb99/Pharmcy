import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.base import PharmacyVerificationStatus
from app.models.pharmacy import Pharmacy
from app.models.user import User


@pytest.mark.asyncio
async def test_pharmacy_verification_and_guard(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_token: str,
):
    phone = "+201144556677"
    license_number = "PH-VERIFY-2026-TEST"

    # 1. Register pharmacy
    reg_res = await client.post(
        f"{settings.API_V1_STR}/auth/register/pharmacy",
        json={
            "representative_name": "د. طارق كامل",
            "email": "tarek@pharma.com",
            "phone": phone,
            "password": "PharmaPass123!",
            "pharmacy_name": "صيدلية طارق الكبرى",
            "address": "الدقي، الجيزة",
            "license_number": license_number,
            "lat": 30.0384,
            "lng": 31.2118,
            "service_radius_km": 5.0,
            "delivery_available": True,
        },
    )
    assert reg_res.status_code == 201

    # Verify user to enable login
    user_stmt = select(User).where(User.phone == phone)
    user_res = await db_session.execute(user_stmt)
    pharmacy_user = user_res.scalars().first()
    pharmacy_user.is_verified = True
    await db_session.commit()

    # 2. Login as pharmacy
    login_res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": phone, "password": "PharmaPass123!"},
    )
    assert login_res.status_code == 200
    pharma_token = login_res.json()["access_token"]
    pharmacy_id = login_res.json()["pharmacy"]["id"]

    # 3. Attempt order/request access while verification is still PENDING
    guard_res = await client.get(
        f"{settings.API_V1_STR}/pharmacies/active-orders-guard",
        headers={"Authorization": f"Bearer {pharma_token}"},
    )
    assert guard_res.status_code == 403
    assert "قيد التحقق من الترخيص" in guard_res.json()["detail"]

    # 4. Admin inspects pending pharmacies queue
    admin_list_res = await client.get(
        f"{settings.API_V1_STR}/admin/pharmacies?verification_status=pending",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_list_res.status_code == 200
    pending_list = admin_list_res.json()
    assert any(p["license_number"] == license_number for p in pending_list)

    # 5. Admin approves the pharmacy
    approve_res = await client.post(
        f"{settings.API_V1_STR}/admin/pharmacies/{pharmacy_id}/verification",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"action": "approve"},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["verification_status"] == "verified"

    # 6. Verify audit log entry was created
    audit_stmt = select(AuditLog).where(
        AuditLog.target == f"pharmacy:{pharmacy_id}",
        AuditLog.action == "PHARMACY_VERIFIED",
    )
    audit_res = await db_session.execute(audit_stmt)
    log_entry = audit_res.scalars().first()
    assert log_entry is not None
    assert log_entry.action == "PHARMACY_VERIFIED"

    # 7. Now pharmacy accesses the guarded endpoint -> SUCCESS!
    guard_res_approved = await client.get(
        f"{settings.API_V1_STR}/pharmacies/active-orders-guard",
        headers={"Authorization": f"Bearer {pharma_token}"},
    )
    assert guard_res_approved.status_code == 200
    assert guard_res_approved.json()["status"] == "allowed"


@pytest.mark.asyncio
async def test_admin_rejection_flow(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_token: str,
):
    phone = "+201177889900"
    license_number = "PH-REJECT-TEST"

    # Register pharmacy
    await client.post(
        f"{settings.API_V1_STR}/auth/register/pharmacy",
        json={
            "representative_name": "د. نادر فهمي",
            "email": "nader@pharma.com",
            "phone": phone,
            "password": "Password123!",
            "pharmacy_name": "صيدلية مشكوك فيها",
            "address": "عنوان غير مكتمل",
            "license_number": license_number,
            "lat": 30.0,
            "lng": 31.0,
        },
    )

    pharma_stmt = select(Pharmacy).where(Pharmacy.license_number == license_number)
    pharma_res = await db_session.execute(pharma_stmt)
    pharma = pharma_res.scalars().first()

    # Admin rejects
    reject_res = await client.post(
        f"{settings.API_V1_STR}/admin/pharmacies/{pharma.id}/verification",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"action": "reject", "reason": "رقم الترخيص غير مطابق لسجلات نقابة الصيادلة"},
    )
    assert reject_res.status_code == 200
    data = reject_res.json()
    assert data["verification_status"] == "rejected"
    assert "غير مطابق" in data["rejection_reason"]
