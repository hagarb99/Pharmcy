import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.base import UserRole
from app.models.user import User

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dawatech.init_db")


async def init_db_data():
    async with AsyncSessionLocal() as db:
        try:
            # Check if superuser already exists
            stmt = select(User).where(User.email == settings.FIRST_SUPERUSER_EMAIL.lower())
            result = await db.execute(stmt)
            admin_user = result.scalars().first()

            if not admin_user:
                logger.info(f"Creating initial admin user: {settings.FIRST_SUPERUSER_EMAIL}")
                superuser = User(
                    name=settings.FIRST_SUPERUSER_NAME,
                    email=settings.FIRST_SUPERUSER_EMAIL.lower(),
                    phone=settings.FIRST_SUPERUSER_PHONE,
                    password_hash=get_password_hash(settings.FIRST_SUPERUSER_PASSWORD),
                    role=UserRole.ADMIN,
                    is_verified=True,
                    is_active=True,
                )
                db.add(superuser)
                await db.commit()
                logger.info("Superuser created successfully!")
            else:
                logger.info(f"Superuser {settings.FIRST_SUPERUSER_EMAIL} already exists.")
        except Exception as e:
            logger.warning(f"Initial DB check/seed encountered: {e}")


if __name__ == "__main__":
    async def main():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await init_db_data()
        await engine.dispose()

    asyncio.run(main())
