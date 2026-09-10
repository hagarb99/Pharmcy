import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.models.base import OrderStatus, PharmacyStatus, PharmacyVerificationStatus, QuoteStatus, RequestStatus, UserRole
from app.models.order import Order
from app.models.pharmacy import Pharmacy
from app.models.quote import PharmacyQuote
from app.models.request import PrescriptionRequest
from app.models.user import User


@pytest_asyncio.fixture
async def patient_fixture(db_session: AsyncSession) -> tuple[User, str]:
    user = User(
        name="أحمد محمود المريض",
        email="patient_marketplace@test.com",
        phone="+201011112233",
        password_hash=get_password_hash("SecretPass123!"),
        role=UserRole.PATIENT,
        is_verified=True,
        is_active=True,
        lat=30.0444,
        lng=31.2357,
        location="وسط البلد، القاهرة",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    token = create_access_token(user.id, role=user.role.value)
    return user, token


@pytest_asyncio.fixture
async def nearby_pharmacy_fixture(db_session: AsyncSession) -> tuple[Pharmacy, str]:
    user = User(
        name="د. طارق الصيدلي القريب",
        email="pharmacy_near@test.com",
        phone="+201099998877",
        password_hash=get_password_hash("SecretPass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
        is_active=True,
        lat=30.0600,
        lng=31.2450,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    pharmacy = Pharmacy(
        user_id=user.id,
        name="صيدلية النيل القريبة",
        address="شارع رمسيس، القاهرة",
        license_number="LIC-NEAR-001",
        lat=30.0600,
        lng=31.2450,
        service_radius_km=5.0,
        verification_status=PharmacyVerificationStatus.VERIFIED,
        status=PharmacyStatus.ACTIVE,
        delivery_available=True,
    )
    db_session.add(pharmacy)
    await db_session.commit()
    await db_session.refresh(pharmacy)

    token = create_access_token(user.id, role=user.role.value)
    return pharmacy, token


@pytest_asyncio.fixture
async def far_pharmacy_fixture(db_session: AsyncSession) -> tuple[Pharmacy, str]:
    user = User(
        name="د. هاني البعيد",
        email="pharmacy_far@test.com",
        phone="+201055554433",
        password_hash=get_password_hash("SecretPass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
        is_active=True,
        lat=30.2200,
        lng=31.4500,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    pharmacy = Pharmacy(
        user_id=user.id,
        name="صيدلية العبور البعيدة",
        address="مدينة العبور، القليوبية",
        license_number="LIC-FAR-002",
        lat=30.2200,
        lng=31.4500,
        service_radius_km=5.0,
        verification_status=PharmacyVerificationStatus.VERIFIED,
        status=PharmacyStatus.ACTIVE,
        delivery_available=True,
    )
    db_session.add(pharmacy)
    await db_session.commit()
    await db_session.refresh(pharmacy)

    token = create_access_token(user.id, role=user.role.value)
    return pharmacy, token


@pytest_asyncio.fixture
async def unverified_pharmacy_fixture(db_session: AsyncSession) -> tuple[Pharmacy, str]:
    user = User(
        name="د. سامي غير المعتمد",
        email="pharmacy_unverified@test.com",
        phone="+201077776655",
        password_hash=get_password_hash("SecretPass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
        is_active=True,
        lat=30.0500,
        lng=31.2400,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    pharmacy = Pharmacy(
        user_id=user.id,
        name="صيدلية تحت المراجعة",
        address="الدقي، الجيزة",
        license_number="LIC-PEND-003",
        lat=30.0500,
        lng=31.2400,
        service_radius_km=5.0,
        verification_status=PharmacyVerificationStatus.PENDING,
        status=PharmacyStatus.ACTIVE,
        delivery_available=False,
    )
    db_session.add(pharmacy)
    await db_session.commit()
    await db_session.refresh(pharmacy)

    token = create_access_token(user.id, role=user.role.value)
    return pharmacy, token


@pytest_asyncio.fixture
async def competing_pharmacy_fixture(db_session: AsyncSession) -> tuple[Pharmacy, str]:
    user = User(
        name="د. إبراهيم المنافس",
        email="pharmacy_competing@test.com",
        phone="+201033332211",
        password_hash=get_password_hash("SecretPass123!"),
        role=UserRole.PHARMACY,
        is_verified=True,
        is_active=True,
        lat=30.0500,
        lng=31.2600,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    pharmacy = Pharmacy(
        user_id=user.id,
        name="صيدلية القاهرة الحديثة",
        address="ميدان التحرير",
        license_number="LIC-COMP-004",
        lat=30.0500,
        lng=31.2600,
        service_radius_km=5.0,
        verification_status=PharmacyVerificationStatus.VERIFIED,
        status=PharmacyStatus.ACTIVE,
        delivery_available=True,
    )
    db_session.add(pharmacy)
    await db_session.commit()
    await db_session.refresh(pharmacy)

    token = create_access_token(user.id, role=user.role.value)
    return pharmacy, token


@pytest.mark.asyncio
async def test_patient_create_request(
    client: AsyncClient,
    patient_fixture: tuple[User, str],
):
    """Test patient creating a prescription request with multiple drug items."""
    patient, token = patient_fixture
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "items": [
            {"drug_name": "Panadol Extra 500mg", "dosage": "أقراص", "quantity": 2, "notes": "شريطين"},
            {"drug_name": "Congestal", "dosage": "أقراص", "quantity": 1, "notes": None},
        ],
        "location_label": "وسط البلد، القاهرة",
        "delivery_preference": "delivery_preferred",
        "notes": "يرجى التوصيل بعد الساعة 5 مساءً",
    }

    res = await client.post(f"{settings.API_V1_STR}/requests", json=payload, headers=headers)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "pending"
    assert len(data["items"]) == 2
    assert data["quotes_count"] == 0
    assert data["has_timed_out"] is False
    assert "timeout_at" in data


@pytest.mark.asyncio
async def test_geospatial_filtering(
    client: AsyncClient,
    patient_fixture: tuple[User, str],
    nearby_pharmacy_fixture: tuple[Pharmacy, str],
    far_pharmacy_fixture: tuple[Pharmacy, str],
    unverified_pharmacy_fixture: tuple[Pharmacy, str],
):
    """
    Test geospatial radius matching:
    - Nearby verified pharmacy (~2 km) sees the incoming request.
    - Far pharmacy (~20 km) does NOT see the request.
    - Unverified pharmacy is rejected with 403 Forbidden.
    """
    patient, p_token = patient_fixture
    near_ph, near_token = nearby_pharmacy_fixture
    far_ph, far_token = far_pharmacy_fixture
    unverified_ph, unverified_token = unverified_pharmacy_fixture

    # 1. Patient creates request in Downtown Cairo
    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={
            "items": [{"drug_name": "Augmentin 1g", "quantity": 1}],
            "lat": 30.0444,
            "lng": 31.2357,
            "location_label": "وسط البلد",
        },
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert req_res.status_code == 201
    req_id = req_res.json()["id"]

    # 2. Nearby verified pharmacy checks incoming requests -> MUST see it
    near_res = await client.get(
        f"{settings.API_V1_STR}/pharmacies/incoming-requests",
        headers={"Authorization": f"Bearer {near_token}"},
    )
    assert near_res.status_code == 200
    near_list = near_res.json()
    assert len(near_list) >= 1
    matched = next((r for r in near_list if r["id"] == req_id), None)
    assert matched is not None
    assert matched["distance_km"] < 5.0
    assert matched["has_my_quote"] is False

    # 3. Far verified pharmacy checks incoming requests -> MUST NOT see it
    far_res = await client.get(
        f"{settings.API_V1_STR}/pharmacies/incoming-requests",
        headers={"Authorization": f"Bearer {far_token}"},
    )
    assert far_res.status_code == 200
    far_list = far_res.json()
    assert all(r["id"] != req_id for r in far_list)

    # 4. Unverified pharmacy checks -> 403 Forbidden
    unverified_res = await client.get(
        f"{settings.API_V1_STR}/pharmacies/incoming-requests",
        headers={"Authorization": f"Bearer {unverified_token}"},
    )
    assert unverified_res.status_code == 403


@pytest.mark.asyncio
async def test_duplicate_quote_upsert_handling(
    client: AsyncClient,
    patient_fixture: tuple[User, str],
    nearby_pharmacy_fixture: tuple[Pharmacy, str],
):
    """
    Test duplicate-quote handling:
    When a pharmacy submits a second quote for the same request while submitted,
    it updates (upserts) the quote instead of failing or creating duplicates.
    """
    patient, p_token = patient_fixture
    near_ph, near_token = nearby_pharmacy_fixture

    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={"items": [{"drug_name": "Brufen 400", "quantity": 1}]},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    req_data = req_res.json()
    req_id = req_data["id"]
    drug_item_id = req_data["items"][0]["id"]

    # 1. Initial quote submission
    q1_payload = {
        "request_id": req_id,
        "items": [{"drug_item_id": drug_item_id, "is_available": True, "price": 45.0}],
        "delivery_available": True,
        "delivery_fee": 15.0,
        "notes": "الطلب جاهز للتوصيل فوراً",
    }
    res1 = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json=q1_payload,
        headers={"Authorization": f"Bearer {near_token}"},
    )
    assert res1.status_code == 200
    q1_data = res1.json()
    assert q1_data["total_price"] == 60.0  # 45 + 15
    quote_id = q1_data["id"]

    # 2. Second submission from same pharmacy -> UPSERT
    q2_payload = {
        "request_id": req_id,
        "items": [{"drug_item_id": drug_item_id, "is_available": True, "price": 40.0}],
        "delivery_available": True,
        "delivery_fee": 10.0,
        "notes": "تم تخفيض السعر ومصاريف التوصيل خصيصاً لك",
    }
    res2 = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json=q2_payload,
        headers={"Authorization": f"Bearer {near_token}"},
    )
    assert res2.status_code == 200
    q2_data = res2.json()
    assert q2_data["id"] == quote_id  # SAME quote ID preserved!
    assert q2_data["total_price"] == 50.0  # 40 + 10


@pytest.mark.asyncio
async def test_auto_close_competing_quotes_and_order_creation(
    client: AsyncClient,
    db_session: AsyncSession,
    patient_fixture: tuple[User, str],
    nearby_pharmacy_fixture: tuple[Pharmacy, str],
    competing_pharmacy_fixture: tuple[Pharmacy, str],
):
    """
    Test that when a patient accepts a quote:
    1. Winning quote -> accepted
    2. Competing submitted quotes -> automatically rejected with explanation
    3. Request -> ordered
    4. Order record created with matching amounts
    """
    patient, p_token = patient_fixture
    ph_a, token_a = nearby_pharmacy_fixture
    ph_b, token_b = competing_pharmacy_fixture

    # Patient creates request
    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={"items": [{"drug_name": "Cataflam 50mg", "quantity": 1}]},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    req_data = req_res.json()
    req_id = req_data["id"]
    drug_id = req_data["items"][0]["id"]

    # Pharmacy A submits quote
    res_a = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json={
            "request_id": req_id,
            "items": [{"drug_item_id": drug_id, "is_available": True, "price": 50.0}],
            "delivery_available": True,
            "delivery_fee": 10.0,
        },
        headers={"Authorization": f"Bearer {token_a}"},
    )
    quote_a_id = res_a.json()["id"]

    # Pharmacy B submits quote
    res_b = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json={
            "request_id": req_id,
            "items": [{"drug_item_id": drug_id, "is_available": True, "price": 55.0}],
            "delivery_available": False,
            "delivery_fee": 0.0,
        },
        headers={"Authorization": f"Bearer {token_b}"},
    )
    quote_b_id = res_b.json()["id"]

    # Patient selects Pharmacy A's quote with delivery
    select_res = await client.post(
        f"{settings.API_V1_STR}/requests/{req_id}/select-quote",
        json={"quote_id": quote_a_id, "delivery_option": "delivery", "patient_notes": "الدور الثالث شقة 6"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert select_res.status_code == 200
    order_data = select_res.json()
    assert order_data["status"] == "confirmed"
    assert order_data["delivery_option"] == "delivery"
    assert order_data["items_total"] == 50.0
    assert order_data["delivery_fee"] == 10.0
    assert order_data["total_amount"] == 60.0

    # Verify winning quote status in DB
    qa_db = (await db_session.execute(select(PharmacyQuote).where(PharmacyQuote.id == uuid.UUID(quote_a_id)))).scalar_one()
    assert qa_db.status == QuoteStatus.ACCEPTED

    # Verify losing quote automatically transitioned to REJECTED
    qb_db = (await db_session.execute(select(PharmacyQuote).where(PharmacyQuote.id == uuid.UUID(quote_b_id)))).scalar_one()
    assert qb_db.status == QuoteStatus.REJECTED
    assert "صيدلية أخرى" in (qb_db.rejection_reason or "")


@pytest.mark.asyncio
async def test_race_condition_prevent_double_order(
    client: AsyncClient,
    patient_fixture: tuple[User, str],
    nearby_pharmacy_fixture: tuple[Pharmacy, str],
):
    """
    Test prevention of race conditions on quote selection:
    Second attempt to select quote on already ordered request must fail with 409 Conflict.
    """
    patient, p_token = patient_fixture
    near_ph, near_token = nearby_pharmacy_fixture

    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={"items": [{"drug_name": "Antinal", "quantity": 1}]},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    req_data = req_res.json()
    req_id = req_data["id"]
    drug_id = req_data["items"][0]["id"]

    quote_res = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json={
            "request_id": req_id,
            "items": [{"drug_item_id": drug_id, "is_available": True, "price": 30.0}],
        },
        headers={"Authorization": f"Bearer {near_token}"},
    )
    quote_id = quote_res.json()["id"]

    # First accept -> 200 OK
    res1 = await client.post(
        f"{settings.API_V1_STR}/requests/{req_id}/select-quote",
        json={"quote_id": quote_id, "delivery_option": "pickup"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert res1.status_code == 200

    # Second concurrent or repeated accept -> 409 Conflict
    res2 = await client.post(
        f"{settings.API_V1_STR}/requests/{req_id}/select-quote",
        json={"quote_id": quote_id, "delivery_option": "pickup"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert res2.status_code == 409


@pytest.mark.asyncio
async def test_timeout_flag_calculation(
    client: AsyncClient,
    db_session: AsyncSession,
    patient_fixture: tuple[User, str],
):
    """
    Test 15-minute response timeout state:
    Requests older than 15 minutes with 0 quotes must report has_timed_out: True.
    """
    patient, p_token = patient_fixture

    # Create request directly with created_at set to 20 minutes ago
    old_req = PrescriptionRequest(
        patient_id=patient.id,
        status=RequestStatus.PENDING,
        lat=patient.lat,
        lng=patient.lng,
        location_label=patient.location,
        created_at=datetime.now(timezone.utc) - timedelta(minutes=20),
    )
    db_session.add(old_req)
    await db_session.commit()

    res = await client.get(
        f"{settings.API_V1_STR}/requests/my",
        headers={"Authorization": f"Bearer {p_token}"},
    )
    assert res.status_code == 200
    items = res.json()
    timed_out_item = next((r for r in items if r["id"] == str(old_req.id)), None)
    assert timed_out_item is not None
    assert timed_out_item["has_timed_out"] is True


@pytest.mark.asyncio
async def test_order_status_progression(
    client: AsyncClient,
    patient_fixture: tuple[User, str],
    nearby_pharmacy_fixture: tuple[Pharmacy, str],
):
    """Test updating order status lifecycle from confirmed -> in_preparation -> completed."""
    patient, p_token = patient_fixture
    near_ph, near_token = nearby_pharmacy_fixture

    req_res = await client.post(
        f"{settings.API_V1_STR}/requests",
        json={"items": [{"drug_name": "Telfast 120mg", "quantity": 1}]},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    req_id = req_res.json()["id"]
    drug_id = req_res.json()["items"][0]["id"]

    quote_res = await client.post(
        f"{settings.API_V1_STR}/quotes",
        json={
            "request_id": req_id,
            "items": [{"drug_item_id": drug_id, "is_available": True, "price": 70.0}],
        },
        headers={"Authorization": f"Bearer {near_token}"},
    )
    quote_id = quote_res.json()["id"]

    order_res = await client.post(
        f"{settings.API_V1_STR}/requests/{req_id}/select-quote",
        json={"quote_id": quote_id, "delivery_option": "pickup"},
        headers={"Authorization": f"Bearer {p_token}"},
    )
    order_id = order_res.json()["id"]

    # Pharmacy updates status to in_preparation
    p1 = await client.patch(
        f"{settings.API_V1_STR}/orders/{order_id}/status",
        json={"status": "in_preparation"},
        headers={"Authorization": f"Bearer {near_token}"},
    )
    assert p1.status_code == 200
    assert p1.json()["status"] == "in_preparation"

    # Pharmacy updates status to completed
    p2 = await client.patch(
        f"{settings.API_V1_STR}/orders/{order_id}/status",
        json={"status": "completed"},
        headers={"Authorization": f"Bearer {near_token}"},
    )
    assert p2.status_code == 200
    assert p2.json()["status"] == "completed"
