import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_token,
)
from app.models.pharmacy import Pharmacy
from app.models.refresh_token import RefreshToken
from app.models.user import User


class TokenService:
    @staticmethod
    async def create_tokens_for_user(
        db: AsyncSession,
        user: User,
        pharmacy: Optional[Pharmacy] = None,
    ) -> Tuple[str, str, int]:
        """
        Creates a short-lived access token and a rotating long-lived refresh token.
        Returns: (access_token, raw_refresh_token, expires_in_seconds)
        """
        extra_claims = {
            "email": user.email,
            "phone": user.phone,
            "name": user.name,
            "is_verified": user.is_verified,
        }
        if pharmacy:
            extra_claims["pharmacy_id"] = str(pharmacy.id)
            extra_claims["verification_status"] = pharmacy.verification_status.value

        access_token = create_access_token(
            subject=user.id,
            role=user.role.value,
            extra_claims=extra_claims,
        )

        # Generate refresh token
        raw_refresh_token = generate_refresh_token()
        token_hash = hash_token(raw_refresh_token)
        expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

        refresh_record = RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            revoked=False,
        )
        db.add(refresh_record)
        await db.commit()

        expires_in = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
        return access_token, raw_refresh_token, expires_in

    @staticmethod
    async def rotate_refresh_token(
        db: AsyncSession,
        raw_refresh_token: str,
    ) -> Tuple[Optional[str], Optional[str], Optional[int], Optional[User], Optional[Pharmacy], str]:
        """
        Validates the refresh token, revokes it, and issues a new pair of tokens.
        Returns: (access_token, new_refresh_token, expires_in, user, pharmacy, error_message)
        """
        token_hash = hash_token(raw_refresh_token)
        stmt = (
            select(RefreshToken)
            .where(RefreshToken.token_hash == token_hash)
            .limit(1)
        )
        result = await db.execute(stmt)
        record = result.scalars().first()

        if not record:
            return None, None, None, None, None, "رمز التحديث غير صالح"

        if record.revoked:
            return None, None, None, None, None, "تم إلغاء صلاحية رمز التحديث مسبقاً"

        exp = record.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)

        if exp < datetime.now(timezone.utc):
            return None, None, None, None, None, "انتهت صلاحية جلسة الدخول، يرجى تسجيل الدخول مجدداً"

        # Revoke old refresh token (Token Rotation)
        record.revoked = True

        # Fetch user along with pharmacy profile
        user_stmt = (
            select(User)
            .options(selectinload(User.pharmacy_profile))
            .where(User.id == record.user_id)
        )
        user_res = await db.execute(user_stmt)
        user = user_res.scalars().first()

        if not user or not user.is_active:
            await db.commit()
            return None, None, None, None, None, "الحساب غير نشط أو غير موجود"

        # Issue new token pair
        access_token, new_refresh_token, expires_in = await TokenService.create_tokens_for_user(
            db, user, user.pharmacy_profile
        )
        return access_token, new_refresh_token, expires_in, user, user.pharmacy_profile, ""

    @staticmethod
    async def revoke_token(db: AsyncSession, raw_refresh_token: str) -> bool:
        """Revokes a refresh token immediately (for logout)."""
        token_hash = hash_token(raw_refresh_token)
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash).limit(1)
        result = await db.execute(stmt)
        record = result.scalars().first()
        if record:
            record.revoked = True
            await db.commit()
            return True
        return False
