"""Runtime configuration. Every environment variable the API reads is declared here."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Base URL of the Supabase project, e.g. https://abcd.supabase.co. Used to fetch the JWKS
    # that signs user access tokens. Without it, every protected route answers 503.
    supabase_url: str | None = None
    # Audience claim Supabase puts on user access tokens.
    supabase_jwt_audience: str = "authenticated"


@lru_cache
def get_settings() -> Settings:
    return Settings()
