from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    OTPVerifyRequest,
    PatientRegisterRequest,
    PharmacyRegisterRequest,
    RefreshTokenRequest,
    RegisterResponse,
    ResendOTPRequest,
    TokenResponse,
)
from app.schemas.pharmacy import PharmacyRead
from app.schemas.user import UserRead
from app.services.audit_service import AuditService
from app.services.auth_service import AuthService
from app.services.otp_service import OTPService
from app.services.token_service import TokenService

router = APIRouter()


@router.post("/register/patient", response_model=RegisterResponse)
@limiter.limit("3/minute")
async def register_patient(
    request: Request,
    response: Response,
    patient_in: PatientRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new patient or resend OTP for interrupted registration."""
    ip = request.client.host if request.client else None
    result = await AuthService.register_patient(db, patient_in, ip=ip)
    response.status_code = status.HTTP_200_OK if result.is_re_registration else status.HTTP_201_CREATED
    return result


@router.post("/register/pharmacy", response_model=RegisterResponse)
@limiter.limit("3/minute")
async def register_pharmacy(
    request: Request,
    response: Response,
    pharmacy_in: PharmacyRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a pharmacy with license number (status=pending)."""
    ip = request.client.host if request.client else None
    result = await AuthService.register_pharmacy(db, pharmacy_in, ip=ip)
    response.status_code = status.HTTP_200_OK if result.is_re_registration else status.HTTP_201_CREATED
    return result


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with Email or Egyptian Phone + Password."""
    ip = request.client.host if request.client else None
    return await AuthService.authenticate_user(
        db, login_data.identifier, login_data.password, ip=ip
    )


@router.post("/verify-otp", response_model=TokenResponse)
@limiter.limit("5/10minute")
async def verify_otp(
    request: Request,
    otp_data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify 6-digit OTP code to activate account and receive tokens."""
    ip = request.client.host if request.client else None
    return await AuthService.verify_registration_otp(
        db, otp_data.identifier, otp_data.code, ip=ip
    )


@router.post("/resend-otp")
@limiter.limit("2/minute")
async def resend_otp(
    request: Request,
    data: ResendOTPRequest,
    db: AsyncSession = Depends(get_db),
):
    """Resend a fresh OTP code for an unverified account."""
    user = await AuthService.find_user_by_identifier(db, data.identifier)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="المستخدم غير مسجل في النظام",
        )
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الحساب مفعل بالفعل، يرجى تسجيل الدخول مباشرة",
        )

    await OTPService.generate_and_dispatch(db, user.phone, purpose="registration")
    return {"message": "تم إرسال رمز تحقق جديد إلى هاتفك بنجاح", "identifier": user.phone}


@router.post("/refresh", response_model=TokenResponse)
async def refresh_session_token(
    request: Request,
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Rotate refresh token and issue a fresh access token."""
    (
        access_token,
        new_refresh_token,
        expires_in,
        user,
        pharmacy,
        err,
    ) = await TokenService.rotate_refresh_token(db, data.refresh_token)

    if err:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=err)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=expires_in,
        user=UserRead.model_validate(user),
        pharmacy=PharmacyRead.model_validate(pharmacy) if pharmacy else None,
    )


@router.post("/logout")
async def logout(
    request: Request,
    data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """Revoke refresh token on logout."""
    await TokenService.revoke_token(db, data.refresh_token)
    return {"message": "تم تسجيل الخروج بنجاح وإلغاء الجلسة"}


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user info and associated pharmacy profile."""
    return {
        "user": UserRead.model_validate(current_user),
        "pharmacy": PharmacyRead.model_validate(current_user.pharmacy_profile)
        if current_user.pharmacy_profile
        else None,
    }
