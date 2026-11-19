"""Clients for the two literature sources: Europe PMC and NCBI E-utilities (PubMed).

Both are free, public, key-less APIs. We identify ourselves with a descriptive User-Agent and
the NCBI ``tool`` parameter, and send no user email or other personal data. Requests retry on
429 and 5xx with exponential backoff, and PubMed calls are rate-limited to NCBI's published limit
(3 requests/second without an API key, 10 with one).
"""

import asyncio
import html
import re
import threading
import time
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any

import httpx

from app.research.evidence import evidence_label
from app.research.schemas import Reference, SourceName

USER_AGENT = "NeuroTrack/0.1 (open-source research platform)"
EUROPE_PMC_SEARCH_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
EUTILS_BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
NCBI_TOOL = "neurotrack"

Sleep = Callable[[float], Awaitable[None]]


class UpstreamError(Exception):
    """A literature source could not be reached or kept failing after retries."""

    def __init__(self, source: SourceName, message: str) -> None:
        super().__init__(f"{source}: {message}")
        self.source: SourceName = source


@dataclass(frozen=True)
class RetryPolicy:
    attempts: int = 3
    backoff_s: float = 0.5
    max_retry_after_s: float = 10.0


class RateLimiter:
    """Spaces calls at least ``1 / per_second`` apart, process-wide.

    Slots are reserved under a threading lock with no await inside it, so this is safe across
    event loops and threads; the wait itself happens outside the lock.
    """

    def __init__(self, per_second: float) -> None:
        self.interval = 1.0 / per_second
        self._next = 0.0
        self._lock = threading.Lock()

    def reserve(self) -> float:
        """Reserve the next slot and return how long to wait for it, in seconds."""
        with self._lock:
            now = time.monotonic()
            slot = max(now, self._next)
            self._next = slot + self.interval
            return slot - now

    async def acquire(self, sleep: Sleep = asyncio.sleep) -> None:
        delay = self.reserve()
        if delay > 0:
            await sleep(delay)


# One limiter per key state, shared by every request this process makes to NCBI.
PUBMED_LIMITER_NO_KEY = RateLimiter(3)
PUBMED_LIMITER_WITH_KEY = RateLimiter(10)


def _retry_after(response: httpx.Response, policy: RetryPolicy) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    try:
        return min(max(float(value), 0.0), policy.max_retry_after_s)
    except ValueError:
        return None


async def get_with_retries(
    http: httpx.AsyncClient,
    source: SourceName,
    url: str,
    params: Mapping[str, str | int],
    *,
    policy: RetryPolicy,
    sleep: Sleep = asyncio.sleep,
    limiter: RateLimiter | None = None,
) -> httpx.Response:
    """GET with retries on 429, 5xx and transport errors. Raises UpstreamError when exhausted."""
    last_problem = "no attempt made"
    for attempt in range(policy.attempts):
        if limiter is not None:
            await limiter.acquire(sleep)
        wait = policy.backoff_s * (2**attempt)
        try:
            # The User-Agent is set per request so it holds whichever client is passed in.
            response = await http.get(url, params=dict(params), headers={"User-Agent": USER_AGENT})
        except httpx.TransportError as exc:
            last_problem = f"{type(exc).__name__} contacting the service"
        else:
            if response.status_code == 429 or response.status_code >= 500:
                last_problem = f"HTTP {response.status_code}"
                wait = _retry_after(response, policy) or wait
            elif response.status_code >= 400:
                raise UpstreamError(source, f"HTTP {response.status_code}")
            else:
                return response
        if attempt < policy.attempts - 1:
            await sleep(wait)
    raise UpstreamError(source, f"{last_problem} after {policy.attempts} attempts")


# ---------------------------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------------------------

_TAG = re.compile(r"<[^>]+>")
_DOI_PREFIX = re.compile(r"^(?:https?://(?:dx\.)?doi\.org/|doi:\s*)", re.IGNORECASE)
_YEAR = re.compile(r"\b(1[89]\d{2}|20\d{2})\b")


def clean_text(value: str | None) -> str | None:
    """Strip markup and entities, collapse whitespace. Empty becomes None."""
    if value is None:
        return None
    text = " ".join(html.unescape(_TAG.sub(" ", value)).split())
    # Tag stripping can leave "word ." when a tag closed before punctuation.
    text = re.sub(r"\s+([.,;:])", r"\1", text)
    return text or None


def normalise_doi(value: str | None) -> str | None:
    if not value:
        return None
    doi = _DOI_PREFIX.sub("", value.strip()).strip().lower()
    return doi if doi.startswith("10.") else None


def _year(value: object) -> int | None:
    if value is None:
        return None
    match = _YEAR.search(str(value))
    return int(match.group(1)) if match else None


def pubmed_url(pmid: str) -> str:
    return f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"


def europepmc_url(source: str, record_id: str) -> str:
    return f"https://europepmc.org/article/{source}/{record_id}"


# ---------------------------------------------------------------------------------------------
# Europe PMC
# ---------------------------------------------------------------------------------------------


def _europepmc_authors(record: Mapping[str, Any]) -> list[str]:
    author_list = record.get("authorList")
    authors: list[str] = []
    if isinstance(author_list, Mapping):
        for author in author_list.get("author") or []:
            if not isinstance(author, Mapping):
                continue
            name = author.get("fullName") or author.get("collectiveName")
            if isinstance(name, str) and name.strip():
                authors.append(name.strip())
    if not authors and isinstance(record.get("authorString"), str):
        authors = [a.strip().rstrip(".") for a in record["authorString"].split(",") if a.strip()]
    return authors


def _europepmc_journal(record: Mapping[str, Any]) -> str | None:
    info = record.get("journalInfo")
    if isinstance(info, Mapping):
        journal = info.get("journal")
        if isinstance(journal, Mapping):
            title = journal.get("title") or journal.get("medlineAbbreviation")
            if isinstance(title, str):
                return clean_text(title)
    return None


def parse_europepmc(payload: Mapping[str, Any]) -> list[Reference]:
    """Parse a Europe PMC ``search`` response (``format=json``, ``resultType=core``)."""
    result_list = payload.get("resultList")
    records = result_list.get("result") if isinstance(result_list, Mapping) else None
    references: list[Reference] = []
    for record in records or []:
        if not isinstance(record, Mapping):
            continue
        title = clean_text(record.get("title"))
        if not title:
            continue
        pmid = record.get("pmid") or None
        record_source = str(record.get("source") or "MED")
        record_id = str(record.get("id") or pmid or "")
        pub_types_container = record.get("pubTypeList")
        pub_types: list[str] = []
        if isinstance(pub_types_container, Mapping):
            raw_types = pub_types_container.get("pubType") or []
            pub_types = [raw_types] if isinstance(raw_types, str) else [str(t) for t in raw_types]
        journal_info = record.get("journalInfo")
        info_year = (
            journal_info.get("yearOfPublication") if isinstance(journal_info, Mapping) else None
        )
        if not record_id:
            continue
        references.append(
            Reference(
                source="europepmc",
                pmid=str(pmid) if pmid else None,
                pmcid=record.get("pmcid") or None,
                doi=normalise_doi(record.get("doi")),
                title=title,
                authors=_europepmc_authors(record),
                journal=_europepmc_journal(record),
                year=_year(record.get("pubYear")) or _year(info_year),
                abstract=clean_text(record.get("abstractText")),
                publication_types=pub_types,
                url=europepmc_url(record_source, record_id),
                evidence=evidence_label(pub_types),
            )
        )
    return references


class EuropePmcClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        policy: RetryPolicy = RetryPolicy(),
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self.http = http
        self.policy = policy
        self.sleep = sleep

    async def search(self, query: str, limit: int) -> list[Reference]:
        response = await get_with_retries(
            self.http,
            "europepmc",
            EUROPE_PMC_SEARCH_URL,
            {"query": query, "format": "json", "resultType": "core", "pageSize": limit},
            policy=self.policy,
            sleep=self.sleep,
        )
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamError("europepmc", "response was not valid JSON") from exc
        if not isinstance(payload, Mapping):
            raise UpstreamError("europepmc", "unexpected response shape")
        return parse_europepmc(payload)[:limit]


# ---------------------------------------------------------------------------------------------
# PubMed (NCBI E-utilities)
# ---------------------------------------------------------------------------------------------


def parse_esearch(payload: Mapping[str, Any]) -> list[str]:
    result = payload.get("esearchresult")
    if not isinstance(result, Mapping):
        return []
    return [str(pmid) for pmid in result.get("idlist") or [] if str(pmid).isdigit()]


def _text(element: ET.Element | None) -> str | None:
    if element is None:
        return None
    return clean_text("".join(element.itertext()))


def _pubmed_authors(article: ET.Element) -> list[str]:
    authors: list[str] = []
    for author in article.findall("./AuthorList/Author"):
        collective = _text(author.find("CollectiveName"))
        last = _text(author.find("LastName"))
        initials = _text(author.find("Initials")) or _text(author.find("ForeName"))
        if last:
            authors.append(f"{last} {initials}" if initials else last)
        elif collective:
            authors.append(collective)
    return authors


def _pubmed_abstract(article: ET.Element) -> str | None:
    parts: list[str] = []
    for node in article.findall("./Abstract/AbstractText"):
        text = _text(node)
        if not text:
            continue
        label = node.get("Label")
        parts.append(f"{label.capitalize()}: {text}" if label else text)
    return " ".join(parts) or None


def _pubmed_year(article: ET.Element) -> int | None:
    pub_date = article.find("./Journal/JournalIssue/PubDate")
    if pub_date is not None:
        year = _year(_text(pub_date.find("Year"))) or _year(_text(pub_date.find("MedlineDate")))
        if year:
            return year
    return _year(_text(article.find("./ArticleDate/Year")))


def parse_pubmed_xml(xml_text: str) -> list[Reference]:
    """Parse an ``efetch`` response (``db=pubmed``, ``retmode=xml``)."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise UpstreamError("pubmed", "response was not valid XML") from exc
    references: list[Reference] = []
    for record in root.findall("./PubmedArticle"):
        citation = record.find("MedlineCitation")
        article = citation.find("Article") if citation is not None else None
        pmid = _text(citation.find("PMID")) if citation is not None else None
        if article is None or not pmid:
            continue
        title = _text(article.find("ArticleTitle")) or _text(article.find("VernacularTitle"))
        if not title:
            continue
        ids = {
            node.get("IdType"): _text(node)
            for node in record.findall("./PubmedData/ArticleIdList/ArticleId")
        }
        doi = ids.get("doi")
        if not doi:
            for location in article.findall("ELocationID"):
                if location.get("EIdType") == "doi":
                    doi = _text(location)
        type_nodes = article.findall("./PublicationTypeList/PublicationType")
        publication_types = [t for t in (_text(n) for n in type_nodes) if t]
        references.append(
            Reference(
                source="pubmed",
                pmid=pmid,
                pmcid=ids.get("pmc"),
                doi=normalise_doi(doi),
                title=title,
                authors=_pubmed_authors(article),
                journal=_text(article.find("./Journal/Title")),
                year=_pubmed_year(article),
                abstract=_pubmed_abstract(article),
                publication_types=publication_types,
                url=pubmed_url(pmid),
                evidence=evidence_label(publication_types),
            )
        )
    return references


class PubMedClient:
    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        api_key: str | None = None,
        policy: RetryPolicy = RetryPolicy(),
        sleep: Sleep = asyncio.sleep,
        limiter: RateLimiter | None = None,
    ) -> None:
        self.http = http
        self.api_key = api_key or None
        self.policy = policy
        self.sleep = sleep
        self.limiter = limiter or (
            PUBMED_LIMITER_WITH_KEY if self.api_key else PUBMED_LIMITER_NO_KEY
        )

    def _params(self, extra: Mapping[str, str | int]) -> dict[str, str | int]:
        params: dict[str, str | int] = {"db": "pubmed", "tool": NCBI_TOOL, **extra}
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    async def _get(self, endpoint: str, params: Mapping[str, str | int]) -> httpx.Response:
        return await get_with_retries(
            self.http,
            "pubmed",
            f"{EUTILS_BASE_URL}/{endpoint}",
            self._params(params),
            policy=self.policy,
            sleep=self.sleep,
            limiter=self.limiter,
        )

    async def search(self, query: str, limit: int) -> list[Reference]:
        found = await self._get(
            "esearch.fcgi",
            {"term": query, "retmode": "json", "retmax": limit, "sort": "relevance"},
        )
        try:
            payload = found.json()
        except ValueError as exc:
            raise UpstreamError("pubmed", "esearch response was not valid JSON") from exc
        pmids = parse_esearch(payload if isinstance(payload, Mapping) else {})[:limit]
        if not pmids:
            return []
        fetched = await self._get(
            "efetch.fcgi", {"id": ",".join(pmids), "retmode": "xml", "rettype": "abstract"}
        )
        by_pmid = {ref.pmid: ref for ref in parse_pubmed_xml(fetched.text)}
        # efetch does not promise esearch's relevance order; restore it.
        return [by_pmid[pmid] for pmid in pmids if pmid in by_pmid]


# ---------------------------------------------------------------------------------------------
# Merging
# ---------------------------------------------------------------------------------------------


def _keys(reference: Reference) -> set[str]:
    keys: set[str] = set()
    if reference.pmid:
        keys.add(f"pmid:{reference.pmid}")
    if reference.doi:
        keys.add(f"doi:{reference.doi}")
    return keys


def _merge_into(kept: Reference, other: Reference) -> Reference:
    """Fill gaps in ``kept`` from a duplicate record of the same publication."""
    updates: dict[str, object] = {}
    for field in ("pmid", "pmcid", "doi", "journal", "year", "abstract"):
        if getattr(kept, field) is None and getattr(other, field) is not None:
            updates[field] = getattr(other, field)
    if not kept.authors and other.authors:
        updates["authors"] = other.authors
    extra_types = [t for t in other.publication_types if t not in kept.publication_types]
    if extra_types:
        types = [*kept.publication_types, *extra_types]
        updates["publication_types"] = types
        updates["evidence"] = evidence_label(types)
    return kept.model_copy(update=updates) if updates else kept


def dedupe(references: Iterable[Reference]) -> list[Reference]:
    """Drop duplicates that share a PMID or DOI, keeping the first and merging missing fields."""
    kept: list[Reference] = []
    index_by_key: dict[str, int] = {}
    for reference in references:
        keys = _keys(reference)
        match = next((index_by_key[k] for k in keys if k in index_by_key), None)
        if match is None:
            index_by_key.update(dict.fromkeys(keys, len(kept)))
            kept.append(reference)
            continue
        merged = _merge_into(kept[match], reference)
        kept[match] = merged
        index_by_key.update(dict.fromkeys(_keys(merged), match))
    return kept


def interleave(*lists: list[Reference]) -> list[Reference]:
    """Round-robin merge, so each source's top hits stay near the top."""
    merged: list[Reference] = []
    for i in range(max((len(lst) for lst in lists), default=0)):
        merged.extend(lst[i] for lst in lists if i < len(lst))
    return merged
