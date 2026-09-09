from fastapi import APIRouter

from app.api.v1 import admin, auth, pharmacies, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["المصادقة والتسجيل (Auth)"])
api_router.include_router(users.router, prefix="/users", tags=["المستخدمين (Users)"])
api_router.include_router(pharmacies.router, prefix="/pharmacies", tags=["الصيدليات (Pharmacies)"])
api_router.include_router(admin.router, prefix="/admin", tags=["لوحة تحكم المشرف (Admin)"])
