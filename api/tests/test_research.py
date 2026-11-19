"""Research Assistant tests. Every outbound request goes through httpx.MockTransport: no live calls.

Fixtures in tests/fixtures/research are real responses (trimmed for Europe PMC) recorded from
Europe PMC and NCBI E-utilities, so the parsers are tested against the shapes those services
actually return.
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.config import Settings, get_settings
from app.main import create_app
from app.research.evidence import evidence_label
from app.research.router import get_http_client, get_retry_policy
from app.research.schemas import Reference
from app.research.sources import (
    USER_AGENT,
    EuropePmcClient,
    PubMedClient,
    RateLimitBusyError,
    RateLimiter,
    RetryPolicy,
    UpstreamError,
    dedupe,
    get_with_retries,
    interleave,
    normalise_doi,
    parse_esearch,
    parse_europepmc,
    parse_pubmed_xml,
)
from app.research.summarize import (
    ExtractiveProvider,
    parse_citations,
    split_sentences,
    validate_answer,
)

FIXTURES = Path(__file__).parent / "fixtures" / "research"
EPMC_JSON = json.loads((FIXTURES / "europepmc_search.json").read_text(encoding="utf-8"))
ESEARCH_JSON = json.loads((FIXTURES / "pubmed_esearch.json").read_text(encoding="utf-8"))
EFETCH_XML = (FIXTURES / "pubmed_efetch.xml").read_text(encoding="utf-8")

NO_WAIT = RetryPolicy(attempts=3, backoff_s=0.0)
Handler = Callable[[httpx.Request], httpx.Response]


async def _no_sleep(_seconds: float) -> None:
    return None


def default_handler(request: httpx.Request) -> httpx.Response:
    if request.url.host == "www.ebi.ac.uk":
        return httpx.Response(200, json=EPMC_JSON)
    if request.url.path.endswith("/esearch.fcgi"):
        return httpx.Response(200, json=ESEARCH_JSON)
    if request.url.path.endswith("/efetch.fcgi"):
        return httpx.Response(200, text=EFETCH_XML, headers={"Content-Type": "text/xml"})
    return httpx.Response(404)


def make_client(handler: Handler, settings: Settings | None = None) -> TestClient:
    app = create_app()

    async def http_client() -> AsyncIterator[httpx.AsyncClient]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT}
        ) as client:
            yield client

    app.dependency_overrides[get_http_client] = http_client
    app.dependency_overrides[get_retry_policy] = lambda: NO_WAIT
    app.dependency_overrides[get_settings] = lambda: settings or Settings(_env_file=None)
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        id="00000000-0000-0000-0000-000000000001", email="test@example.com", role="authenticated"
    )
    return TestClient(app)


@pytest.fixture
def research_client() -> TestClient:
    return make_client(default_handler)


# ------------------------------------------------------------------ parsing


def test_parse_europepmc_core_json() -> None:
    refs = parse_europepmc(EPMC_JSON)
    assert len(refs) == 2
    schultz, preprint = refs

    assert schultz.source == "europepmc"
    assert schultz.pmid == "27069377"
    assert schultz.pmcid == "PMC4826767"
    assert schultz.doi == "10.31887/dcns.2016.18.1/wschultz"
    assert schultz.title == "Dopamine reward prediction error coding."
    assert schultz.authors == ["Schultz W"]
    assert schultz.journal == "Dialogues in clinical neuroscience"
    assert schultz.year == 2016
    assert schultz.abstract and schultz.abstract.startswith("Reward prediction errors consist")
    assert schultz.evidence == "review"
    assert schultz.url == "https://europepmc.org/article/MED/27069377"

    assert preprint.pmid is None
    assert preprint.doi and preprint.doi.startswith("10.")
    assert preprint.url.startswith("https://europepmc.org/article/PPR/PPR")
    assert preprint.publication_types == ["Preprint"]
    assert preprint.evidence == "primary-study"
    assert preprint.authors[-1] == "Schultz W"


def test_parse_europepmc_strips_markup_and_tolerates_missing_fields() -> None:
    payload = {
        "resultList": {
            "result": [
                {
                    "id": "1",
                    "source": "MED",
                    "pmid": "1",
                    "title": "<i>In vivo</i> imaging &amp; reward",
                    "abstractText": "<h4>Background</h4>Text here <b>bold</b> .",
                    "authorString": "Doe J, Roe R.",
                },
                {"id": "2", "source": "MED"},  # no title: skipped
                "not-a-record",
            ]
        }
    }
    [ref] = parse_europepmc(payload)
    assert ref.title == "In vivo imaging & reward"
    assert ref.abstract == "Background: Text here bold."
    assert ref.authors == ["Doe J", "Roe R"]
    assert ref.publication_types == [] and ref.evidence == "other"
    assert parse_europepmc({}) == []


def test_parse_pubmed_esearch_and_efetch_xml() -> None:
    assert parse_esearch(ESEARCH_JSON) == ["27069377", "17072591", "26494275"]
    assert parse_esearch({"esearchresult": {"idlist": ["123", "x"]}}) == ["123"]
    assert parse_esearch({}) == []

    refs = {r.pmid: r for r in parse_pubmed_xml(EFETCH_XML)}
    assert set(refs) == {"27069377", "17072591"}
    schultz = refs["27069377"]
    assert schultz.source == "pubmed"
    assert schultz.doi == "10.31887/dcns.2016.18.1/wschultz"
    assert schultz.pmcid == "PMC4826767"
    assert schultz.authors == ["Schultz W"]
    assert schultz.year == 2016
    assert schultz.journal == "Dialogues in clinical neuroscience"
    assert schultz.publication_types == ["Journal Article", "Review"]
    assert schultz.evidence == "review"
    assert schultz.url == "https://pubmed.ncbi.nlm.nih.gov/27069377/"

    # A structured abstract keeps its section labels; cited references' ids are ignored.
    other = refs["17072591"]
    assert other.abstract and "Introduction:" in other.abstract
    assert other.pmcid != "PMC6576600"


def test_parse_pubmed_xml_rejects_garbage() -> None:
    with pytest.raises(UpstreamError):
        parse_pubmed_xml("<not xml")
    assert parse_pubmed_xml("<PubmedArticleSet></PubmedArticleSet>") == []


def test_normalise_doi() -> None:
    assert normalise_doi("https://doi.org/10.1126/Science.275.5306.1593") == (
        "10.1126/science.275.5306.1593"
    )
    assert normalise_doi("doi: 10.1/ABC") == "10.1/abc"
    assert normalise_doi("not a doi") is None
    assert normalise_doi(None) is None


# ------------------------------------------------------------------ evidence labels


@pytest.mark.parametrize(
    ("types", "label"),
    [
        (["Journal Article", "Systematic Review"], "systematic-review/meta-analysis"),
        (["Meta-Analysis", "Review"], "systematic-review/meta-analysis"),
        (["Randomized Controlled Trial", "Journal Article"], "randomized-trial"),
        (["review-article", "Journal Article"], "review"),
        (["Journal Article"], "primary-study"),
        (["research-article"], "primary-study"),
        (["Clinical Trial, Phase II"], "primary-study"),
        (["Observational Study"], "primary-study"),
        (["Comment", "Journal Article"], "other"),
        (["Editorial"], "other"),
        (["Letter"], "other"),
        ([], "other"),
    ],
)
def test_evidence_label(types: list[str], label: str) -> None:
    assert evidence_label(types) == label


# ------------------------------------------------------------------ dedupe


def _ref(**fields: object) -> Reference:
    base: dict[str, object] = {"source": "pubmed", "title": "T", "url": "https://example.org"}
    return Reference.model_validate({**base, **fields})


def test_dedupe_merges_cross_source_duplicates() -> None:
    epmc = parse_europepmc(EPMC_JSON)
    pubmed = parse_pubmed_xml(EFETCH_XML)
    merged = dedupe(interleave(epmc, pubmed))
    pmids = [r.pmid for r in merged]
    assert pmids.count("27069377") == 1
    assert len(merged) == 3  # Schultz (both), the preprint, and 17072591


def test_dedupe_by_doi_fills_missing_fields() -> None:
    a = _ref(source="europepmc", doi="10.1/x", abstract=None, publication_types=["Journal Article"])
    b = _ref(pmid="42", doi="10.1/x", abstract="An abstract.", publication_types=["Review"])
    c = _ref(pmid="42")  # matches b's PMID, which was merged into a
    [merged] = dedupe([a, b, c])
    assert merged.source == "europepmc"
    assert merged.pmid == "42"
    assert merged.abstract == "An abstract."
    assert merged.publication_types == ["Journal Article", "Review"]
    assert merged.evidence == "review"


def test_dedupe_keeps_records_without_identifiers() -> None:
    assert len(dedupe([_ref(), _ref()])) == 2


# ------------------------------------------------------------------ http behaviour


def test_retries_on_429_and_5xx_then_succeeds() -> None:
    statuses = iter([429, 503, 200])
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(next(statuses), json=EPMC_JSON)

    async def run() -> list[Reference]:
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(handler), headers={"User-Agent": USER_AGENT}
        ) as http:
            return await EuropePmcClient(http, policy=NO_WAIT, sleep=_no_sleep).search("x", 5)

    refs = asyncio.run(run())
    assert len(refs) == 2 and len(seen) == 3
    params = seen[0].url.params
    assert params["format"] == "json" and params["resultType"] == "core"
    assert seen[0].headers["User-Agent"] == USER_AGENT
    # No personal data: NCBI's optional email parameter is never sent anywhere.
    assert all("email" not in r.url.params for r in seen)


def test_gives_up_after_retries_and_does_not_retry_4xx() -> None:
    calls = {"n": 0}

    def always_500(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500)

    def bad_request(_request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400)

    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    async def run(handler: Handler) -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            await get_with_retries(
                http, "europepmc", "https://www.ebi.ac.uk/x", {}, policy=NO_WAIT, sleep=_no_sleep
            )

    with pytest.raises(UpstreamError, match="HTTP 500 after 3 attempts"):
        asyncio.run(run(always_500))
    assert calls["n"] == 3
    calls["n"] = 0
    with pytest.raises(UpstreamError, match="HTTP 400"):
        asyncio.run(run(bad_request))
    assert calls["n"] == 1
    with pytest.raises(UpstreamError, match="ReadTimeout"):
        asyncio.run(run(timeout))


def test_backoff_doubles_and_honours_retry_after() -> None:
    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    statuses = iter(
        [
            httpx.Response(500),
            httpx.Response(429, headers={"Retry-After": "2"}),
            httpx.Response(500),
        ]
    )

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _r: next(statuses))) as h:
            await get_with_retries(
                h, "pubmed", "https://x", {}, policy=RetryPolicy(3, 0.5), sleep=record
            )

    with pytest.raises(UpstreamError):
        asyncio.run(run())
    assert waits == [0.5, 2.0]


def test_pubmed_client_sends_tool_and_key_and_is_rate_limited() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return default_handler(request)

    waits: list[float] = []

    async def record(seconds: float) -> None:
        waits.append(seconds)

    async def run(api_key: str | None) -> list[Reference]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = PubMedClient(
                http, api_key=api_key, policy=NO_WAIT, sleep=record, limiter=RateLimiter(3)
            )
            return await client.search("dopamine", 3)

    refs = asyncio.run(run(None))
    # Order follows esearch relevance; 26494275 is absent from efetch and dropped.
    assert [r.pmid for r in refs] == ["27069377", "17072591"]
    esearch, efetch = seen
    assert esearch.url.params["tool"] == "neurotrack"
    # The client was built without headers; the User-Agent is still sent on every request.
    assert esearch.headers["User-Agent"] == USER_AGENT == efetch.headers["User-Agent"]
    assert all("email" not in r.url.params for r in seen)
    assert esearch.url.params["db"] == "pubmed"
    assert "api_key" not in esearch.url.params
    assert efetch.url.params["id"] == "27069377,17072591,26494275"
    # The second call came straight after the first, so it waited for a 1/3 s slot.
    assert len(waits) == 1 and 0.2 < waits[0] <= 1 / 3 + 1e-6

    seen.clear()
    asyncio.run(run("secret-key"))
    assert seen[0].url.params["api_key"] == "secret-key"


def test_default_pubmed_limiters_follow_ncbi_limits() -> None:
    async def run() -> tuple[float, float]:
        async with httpx.AsyncClient() as http:
            return PubMedClient(http).limiter.interval, PubMedClient(
                http, api_key="k"
            ).limiter.interval

    without_key, with_key = asyncio.run(run())
    assert without_key == pytest.approx(1 / 3)
    assert with_key == pytest.approx(1 / 10)


# ------------------------------------------------------------------ summaries and validation

SOURCES = [
    _ref(
        pmid="1",
        doi="10.1/one",
        authors=["Schultz W"],
        abstract=(
            "Background: Reward prediction errors are differences between received and predicted "
            "rewards. Most dopamine neurons signal a reward prediction error in monkeys and "
            "rodents. Funding was provided by a trust."
        ),
    ),
    _ref(
        pmid="2",
        abstract=(
            "Drugs of addiction amplify the dopamine reward signal in several studies of rodents. "
            "This short one."
        ),
    ),
    _ref(pmid="3", abstract=None),
]


def test_split_sentences_handles_abbreviations_and_trailing_markers() -> None:
    text = "Smith et al. found X, e.g. in mice. [1] Second claim [2]. Third."
    assert split_sentences(text) == [
        "Smith et al. found X, e.g. in mice. [1]",
        "Second claim [2].",
        "Third.",
    ]


def test_parse_citations_variants() -> None:
    assert parse_citations("A [1].") == ("A.", [1])
    assert parse_citations("A [1, 3] and [2].") == ("A and.", [1, 3, 2])
    assert parse_citations("A [1-3].")[1] == [1, 2, 3]
    assert parse_citations("A [2][3].")[1] == [2, 3]
    assert parse_citations("A [1-999].")[1] == [1, 999]
    assert parse_citations("No markers.") == ("No markers.", [])


def test_extractive_summary_quotes_top_sentences_with_markers() -> None:
    provider = ExtractiveProvider()
    raw = asyncio.run(provider.generate("dopamine reward prediction error", SOURCES))
    lines = raw.splitlines()
    assert lines, "expected at least one sentence"
    assert all(line.endswith(("[1]", "[2]")) for line in lines)
    # The best match comes first, the structured-abstract label is stripped, and the
    # irrelevant funding sentence and the 3-word fragment are never chosen.
    assert lines[0] == (
        "Most dopamine neurons signal a reward prediction error in monkeys and rodents. [1]"
    )
    assert not any("Background:" in line or "Funding" in line for line in lines)
    assert not any("short one" in line for line in lines)
    result = validate_answer(raw, SOURCES)
    assert result.removed_unsupported == 0
    assert len(result.sentences) == len(lines)


def test_extractive_limits_sentences_per_source() -> None:
    abstract = " ".join(
        f"Dopamine reward signals were measured in cohort number {i}." for i in range(9)
    )
    sources = [_ref(pmid="9", abstract=abstract)]
    raw = asyncio.run(ExtractiveProvider(per_source=2).generate("dopamine reward", sources))
    assert len(raw.splitlines()) == 2


def test_extractive_returns_nothing_for_stopword_only_question() -> None:
    assert asyncio.run(ExtractiveProvider().generate("what is the", SOURCES)) == ""


ADVERSARIAL_LLM_OUTPUT = """Established findings:
- Dopamine neurons signal reward prediction errors [1].
- Addictive drugs amplify the dopamine signal. [2]
Emerging evidence:
* Ketamine cures addiction in all patients [7].
* Prediction errors are encoded in the striatum [0].
* This is supported by many studies.
* Cortical coding was shown by Smith et al. (2019) [1].
* See doi:10.9999/fabricated for details [2].
* PMID: 99999999 confirms it [1].
* Schultz et al. 2016 reviewed prediction errors [1].
* Effort costs are coded too [n].
* Several mechanisms [1, 2] interact, as in [1-2].
* An overreaching claim spans [1-40].
Open questions:
1. Whether these signals generalise to humans remains unclear [2][3].
[1]
"""


def test_validator_drops_unsupported_sentences_from_adversarial_llm_output() -> None:
    result = validate_answer(ADVERSARIAL_LLM_OUTPUT, SOURCES)
    kept = [(s.text, s.citations, s.section) for s in result.sentences]
    assert kept == [
        ("Dopamine neurons signal reward prediction errors.", [1], "established"),
        ("Addictive drugs amplify the dopamine signal.", [2], "established"),
        ("Schultz et al. 2016 reviewed prediction errors.", [1], "emerging"),
        ("Several mechanisms interact, as in.", [1, 2], "emerging"),
        (
            "Whether these signals generalise to humans remains unclear.",
            [2, 3],
            "open-questions",
        ),
    ]
    # [7], [0], uncited, unknown "Smith et al.", fabricated DOI, unknown PMID, [n], [1-40].
    assert result.removed_unsupported == 8
    for sentence in result.sentences:
        assert sentence.citations
        assert all(1 <= i <= len(SOURCES) for i in sentence.citations)


def test_extractive_never_quotes_an_abstracts_own_reference_numbers() -> None:
    # Source 2's abstract cites "[1]" in its own reference list. Quoting that sentence with our
    # "[2]" appended would be parsed as citing *our* source 1 too: a misattribution.
    sources = [
        _ref(pmid="1", abstract="Unrelated text about something else entirely here."),
        _ref(
            pmid="2",
            abstract=(
                "Dopamine reward signals were reported in earlier primate work [1]. "
                "Dopamine reward signals were also measured in a large rodent cohort here."
            ),
        ),
    ]
    raw = asyncio.run(ExtractiveProvider().generate("dopamine reward signals", sources))
    result = validate_answer(raw, sources)
    assert [(s.text, s.citations) for s in result.sentences] == [
        ("Dopamine reward signals were also measured in a large rodent cohort here.", [2])
    ]
    assert result.removed_unsupported == 0


@pytest.mark.parametrize(
    "raw",
    [
        "Dopamine matters [[1]].",  # nested brackets leave "[]"
        "Dopamine matters [1a] [1].",
        "Dopamine matters [^2] [1].",
        "Dopamine matters [Source 3] [1].",
        "Dopamine matters [1, 9].",
        "Dopamine matters [0-1].",
    ],
)
def test_validator_drops_malformed_or_partly_invalid_markers(raw: str) -> None:
    result = validate_answer(raw, SOURCES)
    assert result.sentences == [] and result.removed_unsupported == 1


def test_validator_with_no_sources_keeps_nothing() -> None:
    result = validate_answer("Dopamine matters [1]. It really does.", [])
    assert result.sentences == [] and result.removed_unsupported == 2


# ------------------------------------------------------------------ routes


def test_search_route_merges_sources(research_client: TestClient) -> None:
    response = research_client.get("/research/search", params={"q": "  reward   prediction "})
    assert response.status_code == 200
    body = response.json()
    assert body["failed_sources"] == []
    pmids = [r["pmid"] for r in body["references"]]
    assert pmids.count("27069377") == 1
    assert {r["evidence"] for r in body["references"]} <= {
        "systematic-review/meta-analysis",
        "randomized-trial",
        "review",
        "primary-study",
        "other",
    }


def test_search_route_single_source_and_limit(research_client: TestClient) -> None:
    body = research_client.get(
        "/research/search", params={"q": "reward", "source": "pubmed", "limit": 1}
    ).json()
    assert [r["source"] for r in body["references"]] == ["pubmed"]


def test_search_reports_partial_and_total_upstream_failure() -> None:
    def europepmc_down(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.ebi.ac.uk":
            return httpx.Response(503)
        return default_handler(request)

    body = make_client(europepmc_down).get("/research/search", params={"q": "reward"}).json()
    assert body["failed_sources"] == ["europepmc"]
    assert {r["source"] for r in body["references"]} == {"pubmed"}

    response = make_client(lambda _r: httpx.Response(502)).get(
        "/research/search", params={"q": "reward"}
    )
    assert response.status_code == 502
    assert "not answering" in response.json()["detail"]


def test_answer_route_extractive(research_client: TestClient) -> None:
    response = research_client.post(
        "/research/answer",
        json={
            "question": "How do dopamine neurons code reward prediction errors?",
            "max_sources": 3,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "extractive"
    assert body["provider_note"] is None
    assert body["removed_unsupported"] == 0
    assert 1 <= len(body["sources"]) <= 3
    assert all(s["abstract"] for s in body["sources"])
    assert body["answer_sentences"]
    for sentence in body["answer_sentences"]:
        assert all(1 <= i <= len(body["sources"]) for i in sentence["citations"])
        assert "[" not in sentence["text"]
    assert "not medical advice" in body["disclaimer"]


def _ollama_handler(answer: str | None, status: int = 200) -> Handler:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "ollama.local":
            sent = json.loads(request.content)
            assert sent["stream"] is False and "[1]" in sent["prompt"]
            return httpx.Response(status, json={"response": answer})
        return default_handler(request)

    return handler


def test_answer_route_uses_ollama_and_validates_its_output() -> None:
    settings = Settings(_env_file=None, ollama_url="http://ollama.local:11434")
    llm = "Established findings:\nDopamine neurons code prediction errors [1].\nMade up [9]."
    body = (
        make_client(_ollama_handler(llm), settings)
        .post("/research/answer", json={"question": "dopamine prediction error"})
        .json()
    )
    assert body["provider"] == "ollama"
    assert body["removed_unsupported"] == 1
    assert body["answer_sentences"] == [
        {
            "text": "Dopamine neurons code prediction errors.",
            "citations": [1],
            "section": "established",
        }
    ]


def test_answer_falls_back_to_extractive_when_ollama_fails_or_cites_nothing() -> None:
    settings = Settings(_env_file=None, ollama_url="http://ollama.local:11434")
    question = {"question": "dopamine reward prediction error"}

    down = make_client(_ollama_handler(None, status=500), settings).post(
        "/research/answer", json=question
    )
    assert down.json()["provider"] == "extractive"
    assert "HTTP 500" in down.json()["provider_note"]

    uncited = make_client(_ollama_handler("Everything is known. Trust me."), settings).post(
        "/research/answer", json=question
    )
    body = uncited.json()
    assert body["provider"] == "extractive"
    assert body["removed_unsupported"] == 2
    assert "no sentence with a valid citation" in body["provider_note"]


def test_routes_require_auth(anon_client: TestClient) -> None:
    assert anon_client.get("/research/search", params={"q": "dopamine"}).status_code == 401
    assert anon_client.post("/research/answer", json={"question": "dopamine"}).status_code == 401


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"q": "a"},
        {"q": "   "},
        {"q": "x" * 301},
        {"q": "dopamine", "limit": 26},
        {"q": "dopamine", "limit": 0},
        {"q": "dopamine", "source": "scholar"},
    ],
)
def test_search_rejects_bad_input(research_client: TestClient, params: dict[str, object]) -> None:
    assert research_client.get("/research/search", params=params).status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"question": ""},
        {"question": "   "},
        {"question": "dopamine", "max_sources": 9},
        {"question": "dopamine", "max_sources": 0},
    ],
)
def test_answer_rejects_bad_input(research_client: TestClient, payload: dict[str, object]) -> None:
    assert research_client.post("/research/answer", json=payload).status_code == 422


def test_rate_limiter_queue_is_bounded() -> None:
    limiter = RateLimiter(3, max_wait_s=1.0)
    waits = [limiter.reserve() for _ in range(4)]  # slots at 0, 1/3, 2/3 and 1 s
    assert waits[0] == pytest.approx(0, abs=0.05) and waits[-1] == pytest.approx(1, abs=0.05)
    with pytest.raises(RateLimitBusyError):
        limiter.reserve()  # the next slot is more than 1 s away: refuse, do not queue


def test_a_hung_source_is_reported_failed_and_the_other_still_returns() -> None:
    """One upstream that never answers must not hold back the other source's results."""

    async def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.ebi.ac.uk":
            await asyncio.sleep(5)  # far beyond the deadline below
        return default_handler(request)

    settings = Settings(
        _env_file=None, research_source_deadline_s=1.5
    )  # PubMed needs ~0.4 s: NCBI spacing
    client = make_client(handler, settings)
    started = time.perf_counter()
    response = client.get("/research/search", params={"q": "dopamine", "source": "all"})
    elapsed = time.perf_counter() - started

    assert response.status_code == 200
    body = response.json()
    assert body["failed_sources"] == ["europepmc"]
    assert body["references"], "PubMed results should still be returned"
    assert elapsed < 4  # bounded by the deadline, not the 5 s hang
