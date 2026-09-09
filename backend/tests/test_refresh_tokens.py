import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.models.user import User


@pytest.mark.asyncio
async def test_refresh_token_rotation_and_revocation(client: AsyncClient, test_admin_user: User):
    # 1. Login to get initial tokens
    login_res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": test_admin_user.email, "password": "AdminPass123!"},
    )
    assert login_res.status_code == 200
    initial_data = login_res.json()
    access_token_1 = initial_data["access_token"]
    refresh_token_1 = initial_data["refresh_token"]

    # 2. Test access token works on protected endpoint
    me_res = await client.get(
        f"{settings.API_V1_STR}/users/me",
        headers={"Authorization": f"Bearer {access_token_1}"},
    )
    assert me_res.status_code == 200
    assert me_res.json()["email"] == test_admin_user.email

    # 3. Rotate refresh token
    refresh_res = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert refresh_res.status_code == 200
    refreshed_data = refresh_res.json()
    access_token_2 = refreshed_data["access_token"]
    refresh_token_2 = refreshed_data["refresh_token"]

    # Ensure new tokens were issued and are distinct
    assert refresh_token_2 != refresh_token_1
    assert access_token_2 != access_token_1

    # 4. Attempt to reuse old revoked refresh_token_1 (Token Reuse Attack Prevention)
    reuse_res = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert reuse_res.status_code == 401
    assert "إلغاء صلاحية" in reuse_res.json()["detail"]

    # 5. Logout with current refresh_token_2
    logout_res = await client.post(
        f"{settings.API_V1_STR}/auth/logout",
        json={"refresh_token": refresh_token_2},
    )
    assert logout_res.status_code == 200

    # 6. Attempting refresh after logout must fail
    after_logout_res = await client.post(
        f"{settings.API_V1_STR}/auth/refresh",
        json={"refresh_token": refresh_token_2},
    )
    assert after_logout_res.status_code == 401
