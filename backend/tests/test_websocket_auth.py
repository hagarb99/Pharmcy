import json
import pytest
from starlette.testclient import TestClient

from app.core.security import create_access_token, get_password_hash
from app.main import app
from app.models.base import UserRole
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_websocket_secure_in_message_auth(db_session: AsyncSession):
    """
    Test secure WebSocket handshake:
    1. Connects to /api/v1/ws with NO token in URL.
    2. Sends initial authenticate message with JWT token.
    3. Receives authenticated confirmation.
    4. Supports ping / pong.
    """
    user = User(
        name="مستخدم التجربة اللحظية",
        email="ws_test@dawatech.com",
        phone="+201088887766",
        password_hash=get_password_hash("Pass123!"),
        role=UserRole.PATIENT,
        is_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(user.id, role=user.role.value)

    sync_client = TestClient(app)
    with sync_client.websocket_connect("/api/v1/ws") as websocket:
        # 1. Send authentication payload
        websocket.send_text(json.dumps({"type": "authenticate", "token": token}))
        
        # 2. Receive confirmation
        data = websocket.receive_text()
        response = json.loads(data)
        assert response["type"] == "authenticated"
        assert response["user_id"] == str(user.id)

        # 3. Send ping -> receive pong
        websocket.send_text(json.dumps({"type": "ping"}))
        pong_data = websocket.receive_text()
        assert json.loads(pong_data)["type"] == "pong"
