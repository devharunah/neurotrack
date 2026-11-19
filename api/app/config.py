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


@lru_cache
def get_settings() -> Settings:
    return Settings()
