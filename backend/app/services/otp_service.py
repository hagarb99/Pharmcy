import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import generate_otp_code, hash_token
from app.models.otp import OTPCode

logger = logging.getLogger("dawatech.otp")


class OTPService:
    @staticmethod
    async def generate_and_dispatch(
        db: AsyncSession,
        identifier: str,
        purpose: str = "registration",
    ) -> str:
        """Generate OTP, record SHA-256 hash in DB, and dispatch (or log in dev)."""
        raw_code = generate_otp_code(6)
        code_hash = hash_token(raw_code)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

        otp_record = OTPCode(
            identifier=identifier,
            code_hash=code_hash,
            purpose=purpose,
            attempts=0,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(otp_record)
        await db.commit()

        # In development mode, print OTP clearly to the backend logs
        if settings.ENV == "development" or settings.DEBUG:
            print("\n" + "=" * 57)
            print(f"[DEV OTP DISPATCH] -> {identifier}")
            print(f"Purpose:  {purpose}")
            print(f"OTP Code: {raw_code} (Valid for {settings.OTP_EXPIRE_MINUTES} minutes)")
            print("=" * 57 + "\n", flush=True)
            logger.info(f"[DEV OTP] Identifier={identifier} Code={raw_code}")
        else:
            # Stub for SMS/WhatsApp provider in production
            logger.info(f"Dispatched production OTP to {identifier}")

        return raw_code

    @staticmethod
    async def verify_otp(
        db: AsyncSession,
        identifier: str,
        raw_code: str,
        purpose: str = "registration",
    ) -> tuple[bool, str]:
        """
        Verify raw OTP against stored hash.
        Returns: (is_valid: bool, error_message: str)
        """
        stmt = (
            select(OTPCode)
            .where(
                OTPCode.identifier == identifier,
                OTPCode.purpose == purpose,
                OTPCode.is_used == False,
            )
            .order_by(desc(OTPCode.created_at))
            .limit(1)
        )
        result = await db.execute(stmt)
        record = result.scalars().first()

        if not record:
            return False, "لم يتم العثور على رمز تحقق صالح، يرجى طلب رمز جديد"

        now = datetime.now(timezone.utc)
        exp = record.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)

        if exp < now:
            return False, "انتهت صلاحية رمز التحقق، يرجى طلب رمز جديد"

        if record.attempts >= settings.OTP_MAX_ATTEMPTS:
            return False, "تم تجاوز عدد المحاولات الخاطئة المسموح بها لهذا الرمز، يرجى طلب رمز جديد"

        input_hash = hash_token(raw_code)
        if input_hash != record.code_hash:
            record.attempts += 1
            await db.commit()
            remaining = settings.OTP_MAX_ATTEMPTS - record.attempts
            return False, f"رمز التحقق غير صحيح. المحاولات المتبقية: {max(remaining, 0)}"

        # Mark code as consumed
        record.is_used = True
        await db.commit()
        return True, ""
