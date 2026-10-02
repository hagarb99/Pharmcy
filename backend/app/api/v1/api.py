from fastapi import APIRouter

from app.api.v1 import admin, auth, orders, pharmacies, quotes, requests, uploads, users, ws

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["المصادقة والتسجيل (Auth)"])
api_router.include_router(users.router, prefix="/users", tags=["المستخدمين (Users)"])
api_router.include_router(pharmacies.router, prefix="/pharmacies", tags=["الصيدليات (Pharmacies)"])
api_router.include_router(admin.router, prefix="/admin", tags=["لوحة تحكم المشرف (Admin)"])
api_router.include_router(requests.router, prefix="/requests", tags=["طلبات الأدوية (Requests)"])
api_router.include_router(quotes.router, prefix="/quotes", tags=["عروض الأسعار (Quotes)"])
api_router.include_router(orders.router, prefix="/orders", tags=["الأوامر المؤكدة (Orders)"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["رفع الملفات والروشتات (Uploads)"])
api_router.include_router(ws.router, tags=["الاتصال اللحظي (WebSockets)"])
