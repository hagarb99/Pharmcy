import pytest
from httpx import AsyncClient
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.otp import OTPCode
from app.models.user import User


@pytest.mark.asyncio
async def test_otp_verification_flow(client: AsyncClient, db_session: AsyncSession):
    phone = "+201011223344"
    # 1. Register patient
    reg_res = await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "محمود خليل",
            "email": "khalil@example.com",
            "phone": phone,
            "password": "Password123!",
        },
    )
    assert reg_res.status_code == 201

    # 2. Check unverified state in DB
    user_stmt = select(User).where(User.phone == phone)
    user_res = await db_session.execute(user_stmt)
    user = user_res.scalars().first()
    assert user is not None
    assert user.is_verified is False

    # 3. Enter wrong OTP code
    verify_wrong = await client.post(
        f"{settings.API_V1_STR}/auth/verify-otp",
        json={"identifier": phone, "code": "000000"},
    )
    assert verify_wrong.status_code == 400
    assert "غير صحيح" in verify_wrong.json()["detail"]

    # 4. Trigger resend OTP
    resend_res = await client.post(
        f"{settings.API_V1_STR}/auth/resend-otp",
        json={"identifier": phone},
    )
    assert resend_res.status_code == 200

    # 5. Fetch the latest OTP record from DB to simulate the user receiving it
    otp_stmt = (
        select(OTPCode)
        .where(OTPCode.identifier == phone, OTPCode.is_used == False)
        .order_by(desc(OTPCode.created_at))
    )
    otp_res = await db_session.execute(otp_stmt)
    otp_record = otp_res.scalars().first()
    assert otp_record is not None

    # In dev mode, verify directly using the known hash or dispatching a known code
    from app.core.security import hash_token
    test_code = "123456"
    otp_record.code_hash = hash_token(test_code)
    await db_session.commit()

    # 6. Verify with valid code
    verify_valid = await client.post(
        f"{settings.API_V1_STR}/auth/verify-otp",
        json={"identifier": phone, "code": test_code},
    )
    assert verify_valid.status_code == 200
    data = verify_valid.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["is_verified"] is True

    # 7. Check database state is now verified
    await db_session.refresh(user)
    assert user.is_verified is True


@pytest.mark.asyncio
async def test_re_registration_unverified_vs_verified(client: AsyncClient, db_session: AsyncSession):
    phone = "+201099998888"
    email = "test_rereg@example.com"

    # Step A: Register initially (unverified)
    res1 = await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "يوسف إبراهيم",
            "email": email,
            "phone": phone,
            "password": "Password123!",
        },
    )
    assert res1.status_code == 201
    assert res1.json()["is_re_registration"] is False

    # Step B: User leaves/tab closes without entering OTP.
    # Now user tries to register AGAIN with the same phone/email:
    res2 = await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "يوسف إبراهيم الجديد",
            "email": email,
            "phone": phone,
            "password": "NewPassword123!",
        },
    )
    # Must NOT throw 409 Conflict or duplicate key error; must treat as continuation/resend!
    assert res2.status_code == 200
    assert res2.json()["is_re_registration"] is True
    assert res2.json()["requires_otp"] is True

    # Step C: Complete OTP verification
    from app.core.security import hash_token
    otp_stmt = (
        select(OTPCode)
        .where(OTPCode.identifier == phone, OTPCode.is_used == False)
        .order_by(desc(OTPCode.created_at))
    )
    otp_res = await db_session.execute(otp_stmt)
    otp_record = otp_res.scalars().first()
    otp_record.code_hash = hash_token("654321")
    await db_session.commit()

    verify_res = await client.post(
        f"{settings.API_V1_STR}/auth/verify-otp",
        json={"identifier": phone, "code": "654321"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["user"]["is_verified"] is True

    # Step D: Now that the user IS VERIFIED, attempting to register again MUST fail with 409 Conflict!
    res3 = await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "يوسف متسلل",
            "email": email,
            "phone": phone,
            "password": "AnyPassword123!",
        },
    )
    assert res3.status_code == 409
    assert "مسجل بالفعل" in res3.json()["detail"]
