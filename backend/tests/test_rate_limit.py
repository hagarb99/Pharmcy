import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.core.rate_limit import limiter
from app.main import app


@pytest.mark.asyncio
async def test_login_rate_limiting(client: AsyncClient):
    # Enable rate limiter for this specific test
    limiter.enabled = True
    try:
        # Rapidly attempt 6 logins with invalid password
        # Limit is 5/minute
        responses = []
        for i in range(7):
            res = await client.post(
                f"{settings.API_V1_STR}/auth/login",
                json={"identifier": "nonexistent@example.com", "password": "WrongPassword!"},
            )
            responses.append(res.status_code)

        # The 6th or 7th request must be 429 Too Many Requests
        assert 429 in responses
    finally:
        limiter.enabled = False
