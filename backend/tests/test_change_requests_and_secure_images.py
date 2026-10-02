import io
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.audit import AuditLog
from app.models.base import (
    ChangeRequestStatus,
    DeliveryPreference,
    PharmacyStatus,
    PharmacyVerificationStatus,
    UserRole,
)
from app.models.pharmacy import Pharmacy
from app.models.pharmacy_change_request import PharmacyChangeRequest
from app.models.request import PrescriptionRequest
from app.models.user import User


@pytest.mark.asyncio
async def test_prescription_image_upload_and_secure_access(
    client: AsyncClient, db_session: AsyncSession, admin_token: str
):
    # 1. Create Patient 1 (Owner)
    p1 = User(
        name="مريض 1",
        email="patient1@test.com",
        phone="+201011112222",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PATIENT,
        is_verified=True,
        lat=30.0444,
        lng=31.2357,
    )
    # 2. Create Patient 2 (Unauthorized stranger)
    p2 = User(
        name="مريض 2 غريب",
        email="patient2@test.com",
        phone="+201033334444",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PATIENT,
        is_verified=True,
        lat=30.0444,
        lng=31.2357,
    )
    # 3. Create Nearby Verified Pharmacy (within 5km of 30.0444, 31.2357)
    pharm_user = User(
        name="دكتور صيدلي مجاور",
        email="pharm_near@test.com",
        phone="+201055556666",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
    )
    db_session.add_all([p1, p2, pharm_user])
    await db_session.commit()
    await db_session.refresh(pharm_user)

    pharm = Pharmacy(
        user_id=pharm_user.id,
        name="صيدلية الأمل المجاورة",
        address="شارع التحرير، وسط البلد",
        lat=30.0450,
        lng=31.2360,
        service_radius_km=5.0,
        license_number="LIC-SEC-001",
        verification_status=PharmacyVerificationStatus.VERIFIED,
        status=PharmacyStatus.ACTIVE,
    )
    db_session.add(pharm)
    await db_session.commit()

    # Login tokens
    res_p1 = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": p1.email, "password": "Pass123!"},
    )
    token_p1 = res_p1.json()["access_token"]

    res_p2 = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": p2.email, "password": "Pass123!"},
    )
    token_p2 = res_p2.json()["access_token"]

    res_ph = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": pharm_user.email, "password": "Pass123!"},
    )
    token_ph = res_ph.json()["access_token"]

    # 4. Patient 1 uploads a prescription image
    dummy_image = io.BytesIO(b"\xFF\xD8\xFF\xE0\x00\x10JFIFdummy-prescription-data")
    upload_res = await client.post(
        f"{settings.API_V1_STR}/uploads/prescription",
        files={"file": ("rx_sample.jpg", dummy_image, "image/jpeg")},
        headers={"Authorization": f"Bearer {token_p1}"},
    )
    assert upload_res.status_code == 200, upload_res.text
    uploaded_filename = upload_res.json()["filename"]
    assert uploaded_filename.endswith(".jpg")

    # 5. Patient 1 creates a request using the uploaded image only (items is empty)
    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={
            "items": [],
            "prescription_image_filename": uploaded_filename,
            "notes": "الروشتة مرفقة أرجو توفير الأدوية المكتوبة بها",
        },
        headers={"Authorization": f"Bearer {token_p1}"},
    )
    assert req_res.status_code == 201, req_res.text
    req_data = req_res.json()
    req_id = req_data["id"]
    assert req_data["has_prescription_image"] is True
    assert req_data["prescription_image_filename"] == uploaded_filename
    assert len(req_data["items"]) == 1
    assert "روشتة طبية مصورة" in req_data["items"][0]["drug_name"]

    # 6. Unauthorized stranger Patient 2 attempts to download prescription image -> 403 Forbidden!
    p2_fetch = await client.get(
        f"{settings.API_V1_STR}/requests/{req_id}/prescription-image",
        headers={"Authorization": f"Bearer {token_p2}"},
    )
    assert p2_fetch.status_code == 403, "Stranger patient must be forbidden from viewing private prescription"

    # 7. Patient 1 (Owner) downloads prescription image -> 200 OK
    p1_fetch = await client.get(
        f"{settings.API_V1_STR}/requests/{req_id}/prescription-image",
        headers={"Authorization": f"Bearer {token_p1}"},
    )
    assert p1_fetch.status_code == 200
    assert p1_fetch.content == b"\xFF\xD8\xFF\xE0\x00\x10JFIFdummy-prescription-data"

    # 8. Nearby Verified Pharmacy downloads prescription image -> 200 OK
    ph_fetch = await client.get(
        f"{settings.API_V1_STR}/requests/{req_id}/prescription-image",
        headers={"Authorization": f"Bearer {token_ph}"},
    )
    assert ph_fetch.status_code == 200

    # 9. Admin downloads prescription image -> 200 OK
    adm_fetch = await client.get(
        f"{settings.API_V1_STR}/requests/{req_id}/prescription-image",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert adm_fetch.status_code == 200

    # 10. Verify Audit Log entry created for PRESCRIPTION_IMAGE_VIEWED
    audit_stmt = select(AuditLog).where(
        AuditLog.action == "PRESCRIPTION_IMAGE_VIEWED",
        AuditLog.target == f"request:{req_id}",
    )
    audit_entries = (await db_session.execute(audit_stmt)).scalars().all()
    assert len(audit_entries) >= 3  # p1, ph, adm accesses were logged


@pytest.mark.asyncio
async def test_pharmacy_sensitive_change_requests_and_admin_collision_guard(
    client: AsyncClient, db_session: AsyncSession, admin_token: str
):
    # 1. Create existing user with a taken phone number
    existing_user = User(
        name="مستخدم رقم محجوز",
        email="taken_phone@test.com",
        phone="+201099990000",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PATIENT,
        is_verified=True,
    )
    # 2. Create Pharmacy
    ph_user = User(
        name="صيدلي تعديل البيانات",
        email="pharm_edit@test.com",
        phone="+201088881111",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
    )
    db_session.add_all([existing_user, ph_user])
    await db_session.commit()
    await db_session.refresh(ph_user)

    pharmacy = Pharmacy(
        user_id=ph_user.id,
        name="صيدلية النور الأصلية",
        address="العنوان الأصلي القديم",
        lat=30.0444,
        lng=31.2357,
        service_radius_km=5.0,
        license_number="LIC-CHG-002",
        verification_status=PharmacyVerificationStatus.VERIFIED,
        status=PharmacyStatus.ACTIVE,
        delivery_available=False,
    )
    db_session.add(pharmacy)
    await db_session.commit()
    pharmacy_id_str = str(pharmacy.id)

    # Login as pharmacy
    login_res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": ph_user.email, "password": "Pass123!"},
    )
    ph_token = login_res.json()["access_token"]

    # 3. Operational update: delivery_available & radius -> Applied IMMEDIATELY
    op_res = await client.patch(
        f"{settings.API_V1_STR}/pharmacies/my-pharmacy",
        json={"delivery_available": True, "service_radius_km": 7.0},
        headers={"Authorization": f"Bearer {ph_token}"},
    )
    assert op_res.status_code == 200
    assert "delivery_available" in op_res.json()["applied_immediately"]

    # Verify pharmacy record changed immediately
    await db_session.refresh(pharmacy)
    assert pharmacy.delivery_available is True
    assert pharmacy.service_radius_km == 7.0

    # 4. Sensitive update: change phone to taken phone number -> Queued as Change Request
    sens_res = await client.patch(
        f"{settings.API_V1_STR}/pharmacies/my-pharmacy",
        json={"phone": "+201099990000"},
        headers={"Authorization": f"Bearer {ph_token}"},
    )
    assert sens_res.status_code == 200
    assert "phone" in sens_res.json()["queued_for_approval"]

    # Verify original user phone did NOT change yet
    await db_session.refresh(ph_user)
    assert ph_user.phone == "+201088881111"

    # 5. Pharmacy submits another update for phone while pending -> Should UPSERT, not duplicate
    upsert_res = await client.patch(
        f"{settings.API_V1_STR}/pharmacies/my-pharmacy",
        json={"phone": "+201099990000"},
        headers={"Authorization": f"Bearer {ph_token}"},
    )
    assert upsert_res.status_code == 200

    # Check database count of change requests for this pharmacy
    cr_stmt = select(PharmacyChangeRequest).where(
        PharmacyChangeRequest.pharmacy_id == pharmacy.id,
        PharmacyChangeRequest.field_name == "phone",
    )
    crs = (await db_session.execute(cr_stmt)).scalars().all()
    assert len(crs) == 1, "Duplicate change requests must be upserted to a single pending record"
    change_req_id = crs[0].id

    # 6. Admin inspects change requests list
    admin_list_res = await client.get(
        f"{settings.API_V1_STR}/admin/change-requests?status=pending",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_list_res.status_code == 200
    crs_list = admin_list_res.json()
    assert len(crs_list) >= 1
    assert any(c["id"] == str(change_req_id) for c in crs_list)

    # 7. Admin attempts to approve, but new phone collides with existing_user -> 409 Conflict!
    approve_collide = await client.post(
        f"{settings.API_V1_STR}/admin/change-requests/{change_req_id}/approve",
        json={"admin_notes": "موافقة على التعديل"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approve_collide.status_code == 409
    assert "مستخدم بالفعل" in approve_collide.json()["detail"]

    # 8. Pharmacy updates request with a valid unique phone number
    await client.patch(
        f"{settings.API_V1_STR}/pharmacies/my-pharmacy",
        json={"phone": "+201077772222"},
        headers={"Authorization": f"Bearer {ph_token}"},
    )

    # 9. Admin approves the valid unique phone change request -> 200 OK!
    approve_ok = await client.post(
        f"{settings.API_V1_STR}/admin/change-requests/{change_req_id}/approve",
        json={"admin_notes": "تم التحقق واعتماد رقم الهاتف الجديد"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert approve_ok.status_code == 200
    assert approve_ok.json()["status"] == "approved"

    # Verify user's active phone has been updated!
    await db_session.refresh(ph_user)
    assert ph_user.phone == "+201077772222"

    # 10. Test Admin toggle pharmacy status between ACTIVE and SUSPENDED
    toggle_suspend = await client.post(
        f"{settings.API_V1_STR}/admin/pharmacies/{pharmacy_id_str}/toggle-status",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert toggle_suspend.status_code == 200
    assert toggle_suspend.json()["status"] == "suspended"

    toggle_activate = await client.post(
        f"{settings.API_V1_STR}/admin/pharmacies/{pharmacy_id_str}/toggle-status",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert toggle_activate.status_code == 200
    assert toggle_activate.json()["status"] == "active"
