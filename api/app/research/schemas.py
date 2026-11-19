"""Request/response contracts for the Research Assistant."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

MAX_SEARCH_LIMIT = 25
MAX_ANSWER_SOURCES = 8
MAX_QUERY_LENGTH = 300

SourceName = Literal["europepmc", "pubmed"]
SourceFilter = Literal["all", "europepmc", "pubmed"]
EvidenceLabel = Literal[
    "systematic-review/meta-analysis", "randomized-trial", "review", "primary-study", "other"
]
ProviderName = Literal["extractive", "ollama"]
AnswerSection = Literal["established", "emerging", "open-questions"]

DISCLAIMER = (
    "Educational and experimental. This answer is assembled automatically from the abstracts "
    "listed below, which are a small, unranked sample of the literature. It is not a systematic "
    "review, not medical advice, and says nothing about any individual. Evidence labels describe "
    "the type of study, not its quality. Read the original publications before relying on a "
    "finding."
)


class Reference(BaseModel):
    """One publication, normalised across Europe PMC and PubMed."""

    source: SourceName
    pmid: str | None = None
    pmcid: str | None = None
    # Always lowercase, without a resolver prefix (e.g. "10.1038/nn.2726").
    doi: str | None = None
    title: str
    authors: list[str] = Field(default_factory=list)
    journal: str | None = None
    year: int | None = None
    abstract: str | None = None
    publication_types: list[str] = Field(default_factory=list)
    url: str
    evidence: EvidenceLabel = "other"


class SearchResult(BaseModel):
    references: list[Reference]
    # Sources that were asked but failed (timeout, 5xx after retries). Empty when all answered.
    failed_sources: list[SourceName] = Field(default_factory=list)


def _clean_query(value: str) -> str:
    cleaned = " ".join(value.split())
    if len(cleaned) < 2:
        raise ValueError("query must contain at least 2 non-space characters")
    return cleaned


class AnswerRequest(BaseModel):
    question: str = Field(min_length=2, max_length=MAX_QUERY_LENGTH)
    max_sources: int = Field(default=5, ge=1, le=MAX_ANSWER_SOURCES)

    @field_validator("question")
    @classmethod
    def _normalise(cls, value: str) -> str:
        return _clean_query(value)


class AnswerSentence(BaseModel):
    text: str
    # 1-based indices into AnswerResult.sources. Never empty: uncited sentences are removed.
    citations: list[int] = Field(min_length=1)
    section: AnswerSection | None = None


class AnswerResult(BaseModel):
    question: str
    answer_sentences: list[AnswerSentence]
    sources: list[Reference]
    provider: ProviderName
    # Why the provider differs from the configured one (e.g. Ollama unreachable), if it does.
    provider_note: str | None = None
    removed_unsupported: int
    failed_sources: list[SourceName] = Field(default_factory=list)
    disclaimer: str = DISCLAIMER
