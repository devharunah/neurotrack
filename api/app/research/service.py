"""Search and answer orchestration over the literature sources and answer providers."""

import asyncio
from dataclasses import dataclass

import httpx

from app.config import Settings
from app.research.schemas import (
    AnswerResult,
    Reference,
    SearchResult,
    SourceFilter,
    SourceName,
)
from app.research.sources import (
    EuropePmcClient,
    PubMedClient,
    RetryPolicy,
    Sleep,
    UpstreamError,
    dedupe,
    interleave,
)
from app.research.summarize import (
    AnswerProvider,
    ExtractiveProvider,
    OllamaProvider,
    ProviderError,
    ValidationResult,
    validate_answer,
)


class AllSourcesFailedError(Exception):
    def __init__(self, failed: list[SourceName]) -> None:
        super().__init__(f"Every literature source failed: {', '.join(failed)}")
        self.failed = failed


@dataclass
class LiteratureService:
    http: httpx.AsyncClient
    settings: Settings
    policy: RetryPolicy
    sleep: Sleep = asyncio.sleep

    def _clients(self, source: SourceFilter) -> dict[SourceName, EuropePmcClient | PubMedClient]:
        clients: dict[SourceName, EuropePmcClient | PubMedClient] = {}
        if source in ("all", "europepmc"):
            clients["europepmc"] = EuropePmcClient(self.http, policy=self.policy, sleep=self.sleep)
        if source in ("all", "pubmed"):
            clients["pubmed"] = PubMedClient(
                self.http,
                api_key=self.settings.ncbi_api_key or None,
                policy=self.policy,
                sleep=self.sleep,
            )
        return clients

    async def search(self, query: str, source: SourceFilter, limit: int) -> SearchResult:
        clients = self._clients(source)
        outcomes = await asyncio.gather(
            *(client.search(query, limit) for client in clients.values()), return_exceptions=True
        )
        lists: list[list[Reference]] = []
        failed: list[SourceName] = []
        for name, outcome in zip(clients, outcomes, strict=True):
            if isinstance(outcome, UpstreamError):
                failed.append(name)
            elif isinstance(outcome, BaseException):
                raise outcome
            else:
                lists.append(outcome)
        if failed and not lists:
            raise AllSourcesFailedError(failed)
        return SearchResult(references=dedupe(interleave(*lists))[:limit], failed_sources=failed)

    def _provider(self) -> AnswerProvider:
        if self.settings.ollama_url:
            return OllamaProvider(
                self.http,
                self.settings.ollama_url,
                self.settings.ollama_model,
                self.settings.ollama_timeout_s,
            )
        return ExtractiveProvider()

    async def answer(self, question: str, max_sources: int) -> AnswerResult:
        # Over-fetch, then prefer records that have an abstract: there is nothing to cite without.
        found = await self.search(question, "all", min(max_sources * 3, 25))
        with_abstract = [r for r in found.references if r.abstract]
        sources = with_abstract[:max_sources]

        if not sources:
            return AnswerResult(
                question=question,
                answer_sentences=[],
                sources=[],
                provider="extractive",
                provider_note="No retrieved record had an abstract to answer from.",
                removed_unsupported=0,
                failed_sources=found.failed_sources,
            )

        provider: AnswerProvider = self._provider()
        note: str | None = None
        removed_by_model = 0
        result: ValidationResult | None = None
        if provider.name != "extractive":
            try:
                candidate = validate_answer(await provider.generate(question, sources), sources)
            except ProviderError as exc:
                note = f"{exc}; showing an extractive summary instead."
            else:
                if candidate.sentences:
                    result = candidate
                else:
                    removed_by_model = candidate.removed_unsupported
                    note = (
                        "The local model gave no sentence with a valid citation; "
                        "showing an extractive summary instead."
                    )
        if result is None:
            provider = ExtractiveProvider()
            extracted = validate_answer(await provider.generate(question, sources), sources)
            result = ValidationResult(
                extracted.sentences, extracted.removed_unsupported + removed_by_model
            )

        if not result.sentences and note is None:
            note = "No abstract sentence matched enough of the question's terms."
        return AnswerResult(
            question=question,
            answer_sentences=result.sentences,
            sources=sources,
            provider=provider.name,
            provider_note=note,
            removed_unsupported=result.removed_unsupported,
            failed_sources=found.failed_sources,
        )
