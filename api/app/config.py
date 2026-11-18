"""Runtime configuration. Every environment variable the API reads is declared here."""

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # "production" switches on HSTS and refuses the permissive ALLOWED_HOSTS default.
    environment: Literal["development", "production"] = "development"

    # Base URL of the Supabase project, e.g. https://abcd.supabase.co. Used to fetch the JWKS
    # that signs user access tokens. Without it, every protected route answers 503.
    supabase_url: str | None = None
    # Audience claim Supabase puts on user access tokens.
    supabase_jwt_audience: str = "authenticated"

    # Research Assistant (M4). All optional: literature search works with none of them set.
    # An NCBI E-utilities key raises the PubMed rate limit from 3 to 10 requests per second.
    ncbi_api_key: str | None = None
    # Base URL of a local Ollama server, e.g. http://127.0.0.1:11434. Unset means no LLM is used
    # and answers are built extractively from the retrieved abstracts.
    ollama_url: str | None = None
    ollama_model: str = "llama3.2"
    # Seconds to wait for one upstream literature request before giving up.
    research_timeout_s: float = 15.0
    # Seconds to wait for an Ollama completion (local models can be slow).
    ollama_timeout_s: float = 60.0

    # Host headers the API answers to (TrustedHostMiddleware). Comma-separated in the env,
    # e.g. ALLOWED_HOSTS=neurotrack-api.onrender.com,localhost. "*" allows any host and is
    # only meant for development.
    allowed_hosts: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["*"])

    # Read the client IP from the first X-Forwarded-For entry. Only enable behind a proxy that
    # overwrites that header (Render, Fly.io, Hugging Face Spaces all do); otherwise a client
    # can pick its own rate-limit bucket.
    trust_proxy_headers: bool = False

    # Requests whose body is larger than this are rejected with 413.
    max_body_bytes: int = Field(default=2 * 1024 * 1024, ge=1)

    # Token-bucket rate limiting, per client (JWT `sub` when present, otherwise client IP).
    # `burst` is the bucket size, `per_minute` the sustained refill rate.
    rate_limit_enabled: bool = True
    rate_limit_burst: int = Field(default=60, ge=1)
    rate_limit_per_minute: int = Field(default=120, ge=1)
    # Stricter bucket for expensive routes (simulation, literature search).
    rate_limit_strict_burst: int = Field(default=10, ge=1)
    rate_limit_strict_per_minute: int = Field(default=20, ge=1)
    rate_limit_strict_prefixes: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["/quantum/", "/research/"]
    )

    @field_validator("allowed_hosts", "rate_limit_strict_prefixes", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _production_needs_hosts(self) -> "Settings":
        if self.environment == "production" and "*" in self.allowed_hosts:
            raise ValueError("ALLOWED_HOSTS must list real host names when ENVIRONMENT=production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
