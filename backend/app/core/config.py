from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow",
    )

    PROJECT_NAME: str = "Dawa Tech"
    ENV: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Security
    SECRET_KEY: str = "super-secret-dawa-tech-dev-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 14

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://dawatech:dawatech_password@localhost:5432/dawatech_db"
    SYNC_DATABASE_URL: str = "postgresql+psycopg2://dawatech:dawatech_password@localhost:5432/dawatech_db"

    # Superuser Seeding
    FIRST_SUPERUSER_EMAIL: str = "admin@dawatech.com"
    FIRST_SUPERUSER_PASSWORD: str = "AdminPassword123!"
    FIRST_SUPERUSER_PHONE: str = "+201000000001"
    FIRST_SUPERUSER_NAME: str = "مدير المنصة"

    # OTP Settings
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 5

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True

    # CORS
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        elif isinstance(v, list):
            return v
        return []


settings = Settings()
