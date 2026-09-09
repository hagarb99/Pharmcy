import asyncio
import os
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Set test environment flags
os.environ["ENV"] = "development"
os.environ["DEBUG"] = "True"
os.environ["RATE_LIMIT_ENABLED"] = "False"  # Default off in general tests, turned on explicitly in rate limit tests

from app.api.deps import get_db
from app.core.config import settings
from app.core.database import Base
from app.core.security import get_password_hash
from app.main import app
from app.models.base import PharmacyStatus, PharmacyVerificationStatus, UserRole
from app.models.pharmacy import Pharmacy
from app.models.user import User

# Use an isolated SQLite async database for ultra-fast local testing
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def prepare_database():
    """Create all tables before each test and drop them afterwards."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_admin_user(db_session: AsyncSession) -> User:
    admin = User(
        name="مدير الاختبار",
        email="admin_test@dawatech.com",
        phone="+201000000099",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_verified=True,
        is_active=True,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, test_admin_user: User) -> str:
    res = await client.post(
        f"{settings.API_V1_STR}/auth/login",
        json={"identifier": test_admin_user.email, "password": "AdminPass123!"},
    )
    return res.json()["access_token"]
