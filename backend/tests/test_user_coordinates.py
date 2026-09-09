import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import User


@pytest.mark.asyncio
async def test_user_coordinates_persistence(client: AsyncClient, db_session: AsyncSession):
    phone = "+201022334455"
    # Register patient with coordinates
    reg_res = await client.post(
        f"{settings.API_V1_STR}/auth/register/patient",
        json={
            "name": "كريم سامي",
            "email": "karim@example.com",
            "phone": phone,
            "password": "Password123!",
            "lat": 30.0711,
            "lng": 31.3499,
            "location": "مدينة نصر، الحي السابع",
        },
    )
    assert reg_res.status_code == 201

    # Verify directly in DB
    user_stmt = select(User).where(User.phone == phone)
    user_res = await db_session.execute(user_stmt)
    user = user_res.scalars().first()
    assert user is not None
    assert user.lat == pytest.approx(30.0711, rel=1e-4)
    assert user.lng == pytest.approx(31.3499, rel=1e-4)
    assert user.location == "مدينة نصر، الحي السابع"

    # Make verified to test profile endpoints
    user.is_verified = True
    await db_session.commit()

    login_res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": phone, "password": "Password123!"},
    )
    token = login_res.json()["access_token"]

    # Update coordinates via PATCH /users/me
    update_res = await client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"lat": 30.0800, "lng": 31.3600, "location": "مدينة نصر، مكرم عبيد"},
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["lat"] == pytest.approx(30.0800, rel=1e-4)
    assert updated_data["lng"] == pytest.approx(31.3600, rel=1e-4)
    assert updated_data["location"] == "مدينة نصر، مكرم عبيد"
