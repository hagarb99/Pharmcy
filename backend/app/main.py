from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.database import engine, Base
from app.core.rate_limit import limiter, rate_limit_exceeded_handler
from app.initial_data import init_db_data


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure tables exist on startup (especially for local/dev/test sqlite or postgres)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed initial admin user if not exists
    await init_db_data()
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="منصة دواء تك (Dawa Tech) - الربط الذكي بين المرضى والصيدليات في مصر",
    version="0.1.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# Rate limiting state & exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# CORS Middleware
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routers
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health", tags=["الصحة والجاهزية (Health)"])
async def health_check():
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENV,
        "version": "0.1.0",
    }


@app.get("/", tags=["الرئيسية"])
async def root():
    return {
        "message": "أهلاً بك في منصة دواء تك (Dawa Tech API)",
        "docs": f"{settings.API_V1_STR}/docs",
        "health": "/health",
    }
