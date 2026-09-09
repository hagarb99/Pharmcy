from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import get_password_hash, verify_password
from app.models.base import PharmacyStatus, PharmacyVerificationStatus, UserRole
from app.models.pharmacy import Pharmacy
from app.models.user import User
from app.schemas.auth import (
    PatientRegisterRequest,
    PharmacyRegisterRequest,
    RegisterResponse,
    TokenResponse,
)
from app.schemas.pharmacy import PharmacyRead
from app.schemas.user import UserRead
from app.services.audit_service import AuditService
from app.services.otp_service import OTPService
from app.services.token_service import TokenService


class AuthService:
    @staticmethod
    async def find_user_by_identifier(db: AsyncSession, identifier: str) -> Optional[User]:
        stmt = (
            select(User)
            .options(selectinload(User.pharmacy_profile))
            .where(or_(User.email == identifier.lower(), User.phone == identifier))
        )
        result = await db.execute(stmt)
        return result.scalars().first()

    @staticmethod
    async def register_patient(
        db: AsyncSession,
        req: PatientRegisterRequest,
        ip: Optional[str] = None,
    ) -> RegisterResponse:
        existing_user = await AuthService.find_user_by_identifier(db, req.email) or \
                        await AuthService.find_user_by_identifier(db, req.phone)

        if existing_user:
            if existing_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="الحساب مسجل بالفعل، يرجى تسجيل الدخول بدلاً من التسجيل من جديد.",
                )
            # Unverified account re-registration: Update credentials/data & resend OTP
            existing_user.name = req.name
            existing_user.password_hash = get_password_hash(req.password)
            existing_user.lat = req.lat
            existing_user.lng = req.lng
            existing_user.location = req.location
            await db.commit()

            await OTPService.generate_and_dispatch(db, existing_user.phone, purpose="registration")
            await AuditService.log_event(
                db,
                action="USER_RE_REGISTRATION_RESEND_OTP",
                target=f"user:{existing_user.id}",
                user_id=existing_user.id,
                ip=ip,
            )
            return RegisterResponse(
                message="تم إرسال رمز تحقق جديد لتفعيل حسابك الحالي.",
                identifier=existing_user.phone,
                requires_otp=True,
                is_re_registration=True,
            )

        # Create new patient user
        new_user = User(
            name=req.name,
            email=req.email.lower(),
            phone=req.phone,
            password_hash=get_password_hash(req.password),
            role=UserRole.PATIENT,
            lat=req.lat,
            lng=req.lng,
            location=req.location,
            is_verified=False,
            is_active=True,
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        # Dispatch OTP code
        await OTPService.generate_and_dispatch(db, new_user.phone, purpose="registration")
        await AuditService.log_event(
            db,
            action="USER_REGISTER_INITIATED",
            target=f"user:{new_user.id}",
            user_id=new_user.id,
            ip=ip,
        )

        return RegisterResponse(
            message="تم إنشاء حساب المريض بنجاح، يرجى إدخال رمز التحقق المرسل لتفعيل الحساب.",
            identifier=new_user.phone,
            requires_otp=True,
            is_re_registration=False,
        )

    @staticmethod
    async def register_pharmacy(
        db: AsyncSession,
        req: PharmacyRegisterRequest,
        ip: Optional[str] = None,
    ) -> RegisterResponse:
        # Check license uniqueness
        clean_license = req.license_number.strip()
        lic_stmt = select(Pharmacy).where(Pharmacy.license_number == clean_license)
        lic_res = await db.execute(lic_stmt)
        if lic_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="رقم ترخيص الصيدلية مسجل مسبقاً في النظام.",
            )

        existing_user = await AuthService.find_user_by_identifier(db, req.email) or \
                        await AuthService.find_user_by_identifier(db, req.phone)

        if existing_user:
            if existing_user.is_verified:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="الحساب مسجل بالفعل، يرجى تسجيل الدخول بدلاً من التسجيل من جديد.",
                )
            # Update existing unverified account and pharmacy profile
            existing_user.name = req.representative_name
            existing_user.password_hash = get_password_hash(req.password)
            existing_user.lat = req.lat
            existing_user.lng = req.lng

            if existing_user.pharmacy_profile:
                existing_user.pharmacy_profile.name = req.pharmacy_name
                existing_user.pharmacy_profile.address = req.address
                existing_user.pharmacy_profile.lat = req.lat
                existing_user.pharmacy_profile.lng = req.lng
                existing_user.pharmacy_profile.license_number = clean_license
                existing_user.pharmacy_profile.service_radius_km = req.service_radius_km
                existing_user.pharmacy_profile.delivery_available = req.delivery_available
            else:
                pharmacy = Pharmacy(
                    user_id=existing_user.id,
                    name=req.pharmacy_name,
                    address=req.address,
                    lat=req.lat,
                    lng=req.lng,
                    service_radius_km=req.service_radius_km,
                    license_number=clean_license,
                    verification_status=PharmacyVerificationStatus.PENDING,
                    status=PharmacyStatus.ACTIVE,
                    delivery_available=req.delivery_available,
                )
                db.add(pharmacy)

            await db.commit()
            await OTPService.generate_and_dispatch(db, existing_user.phone, purpose="registration")
            await AuditService.log_event(
                db,
                action="PHARMACY_RE_REGISTRATION_RESEND_OTP",
                target=f"user:{existing_user.id}",
                user_id=existing_user.id,
                ip=ip,
            )
            return RegisterResponse(
                message="تم إرسال رمز تحقق جديد لتفعيل حساب الصيدلية.",
                identifier=existing_user.phone,
                requires_otp=True,
                is_re_registration=True,
            )

        # Create new pharmacy user and profile
        new_user = User(
            name=req.representative_name,
            email=req.email.lower(),
            phone=req.phone,
            password_hash=get_password_hash(req.password),
            role=UserRole.PHARMACY,
            lat=req.lat,
            lng=req.lng,
            location=req.address,
            is_verified=False,
            is_active=True,
        )
        db.add(new_user)
        await db.flush()

        pharmacy = Pharmacy(
            user_id=new_user.id,
            name=req.pharmacy_name,
            address=req.address,
            lat=req.lat,
            lng=req.lng,
            service_radius_km=req.service_radius_km,
            license_number=clean_license,
            verification_status=PharmacyVerificationStatus.PENDING,
            status=PharmacyStatus.ACTIVE,
            delivery_available=req.delivery_available,
        )
        db.add(pharmacy)
        await db.commit()
        await db.refresh(new_user)

        # Dispatch OTP
        await OTPService.generate_and_dispatch(db, new_user.phone, purpose="registration")
        await AuditService.log_event(
            db,
            action="PHARMACY_REGISTER_INITIATED",
            target=f"pharmacy:{pharmacy.id}",
            user_id=new_user.id,
            ip=ip,
        )

        return RegisterResponse(
            message="تم تسجيل الصيدلية بنجاح، يرجى إدخال رمز التحقق المرسل للمتابعة.",
            identifier=new_user.phone,
            requires_otp=True,
            is_re_registration=False,
        )

    @staticmethod
    async def verify_registration_otp(
        db: AsyncSession,
        identifier: str,
        code: str,
        ip: Optional[str] = None,
    ) -> TokenResponse:
        user = await AuthService.find_user_by_identifier(db, identifier)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="المستخدم غير موجود",
            )

        is_valid, err_msg = await OTPService.verify_otp(
            db, user.phone, code, purpose="registration"
        )
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg,
            )

        user.is_verified = True
        await db.commit()

        # Reload user with pharmacy profile eagerly loaded to prevent MissingGreenlet
        refreshed_user = await AuthService.find_user_by_identifier(db, user.phone)
        assert refreshed_user is not None

        # Issue session tokens
        access_token, refresh_token, expires_in = await TokenService.create_tokens_for_user(
            db, refreshed_user, refreshed_user.pharmacy_profile
        )

        await AuditService.log_event(
            db,
            action="AUTH_OTP_VERIFIED",
            target=f"user:{refreshed_user.id}",
            user_id=refreshed_user.id,
            ip=ip,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            user=UserRead.model_validate(refreshed_user),
            pharmacy=PharmacyRead.model_validate(refreshed_user.pharmacy_profile) if refreshed_user.pharmacy_profile else None,
        )

    @staticmethod
    async def authenticate_user(
        db: AsyncSession,
        identifier: str,
        password: str,
        ip: Optional[str] = None,
    ) -> TokenResponse:
        user = await AuthService.find_user_by_identifier(db, identifier)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="البريد الإلكتروني/رقم الهاتف أو كلمة المرور غير صحيحة",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="هذا الحساب معطل حالياً. يرجى التواصل مع الدعم الفني.",
            )

        if not user.is_verified:
            # Re-dispatch fresh OTP and guide user
            await OTPService.generate_and_dispatch(db, user.phone, purpose="registration")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "الحساب غير مفعل، تم إرسال رمز تحقق جديد إلى هاتفك لتفعيله.",
                    "requires_otp": True,
                    "identifier": user.phone,
                },
            )

        access_token, refresh_token, expires_in = await TokenService.create_tokens_for_user(
            db, user, user.pharmacy_profile
        )

        await AuditService.log_event(
            db,
            action="AUTH_LOGIN_SUCCESS",
            target=f"user:{user.id}",
            user_id=user.id,
            ip=ip,
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
            user=UserRead.model_validate(user),
            pharmacy=PharmacyRead.model_validate(user.pharmacy_profile) if user.pharmacy_profile else None,
        )
