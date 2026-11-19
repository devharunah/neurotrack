"""Answer providers and the citation validator.

A provider turns a question plus retrieved references into raw text in which every sentence ends
with ``[n]`` markers (1-based indices into the references). The raw text is never trusted:
``validate_answer`` keeps only sentences whose citations all point at retrieved references, and
reports how many it dropped. That holds for the extractive provider too, so the guarantee does
not depend on which provider ran.
"""

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.research.schemas import AnswerSection, AnswerSentence, ProviderName, Reference

# ---------------------------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------------------------

_ABBREVIATIONS = (
    "et al.",
    "e.g.",
    "i.e.",
    "vs.",
    "approx.",
    "fig.",
    "figs.",
    "no.",
    "ca.",
    "cf.",
    "dr.",
    "inc.",
    "resp.",
)
_PLACEHOLDER = "\u2063"  # invisible separator: protects abbreviation dots while splitting
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[\[(\"'A-Z0-9])")
_LEADING_MARKERS = re.compile(r"^((?:\[[^\]]*\]\s*)+)")
_STRUCTURED_LABEL = re.compile(
    r"^(?:background|introduction|context|objectives?|aims?|purpose|methods?|design|setting|"
    r"participants|measurements?|results?|findings|conclusions?|interpretation|significance|"
    r"discussion|importance|main outcome measures?)\s*:\s*",
    re.IGNORECASE,
)


def split_sentences(text: str) -> list[str]:
    """Split prose into sentences, keeping citation markers with the sentence they follow."""
    protected = text
    for abbreviation in _ABBREVIATIONS:
        pattern = re.compile(re.escape(abbreviation), re.IGNORECASE)
        protected = pattern.sub(lambda m: m.group(0).replace(".", _PLACEHOLDER), protected)
    sentences: list[str] = []
    for part in _SENTENCE_END.split(protected):
        piece = part.replace(_PLACEHOLDER, ".").strip()
        if not piece:
            continue
        # "Finding. [1] Next sentence" puts the marker at the start of the next piece.
        leading = _LEADING_MARKERS.match(piece)
        if leading and sentences:
            sentences[-1] = f"{sentences[-1]} {leading.group(1).strip()}"
            piece = piece[leading.end() :].strip()
        if piece:
            sentences.append(piece)
    return sentences


_STOPWORDS = frozenset(
    """
    a about above after again against all also am an and any are as at be because been before
    being between both but by can could did do does doing during each few for from further had
    has have having how however if in into is it its itself more most no nor not of off on once
    only or other our out over own same should so some such than that the their them then there
    these they this those through to too under until up very was we were what when where which
    while who whom why will with would you your role effect effects study studies people person
    """.split()  # noqa: SIM905
)
_WORD = re.compile(r"[a-z0-9]+")


def _stem(word: str) -> str:
    for suffix, replacement in (("ies", "y"), ("ing", ""), ("ed", ""), ("es", ""), ("s", "")):
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            return word[: -len(suffix)] + replacement
    return word


def query_terms(text: str) -> set[str]:
    return {_stem(w) for w in _WORD.findall(text.lower()) if len(w) >= 3 and w not in _STOPWORDS}


# ---------------------------------------------------------------------------------------------
# Citation validation
# ---------------------------------------------------------------------------------------------

_MARKER = re.compile(r"\[\s*(\d+(?:\s*(?:[-\u2013,;]|and)\s*\d+)*)\s*\]")
# Anything bracketed that looks like an attempted citation but is not a clean numeric marker.
_BROKEN_MARKER = re.compile(r"\[\s*(?:n|ref|source|citation|\?|[a-z]\w*\s*\d*)\s*\]", re.I)
_DOI = re.compile(r"\b10\.\d{4,9}/[^\s\]\)]+", re.IGNORECASE)
_PMID = re.compile(r"\bPMID:?\s*(\d{4,9})\b", re.IGNORECASE)
_AUTHOR_YEAR = re.compile(r"\b([A-Z][A-Za-z'\-]+)\s+et al\.?,?\s*\(?(?:19|20)\d{2}")
_SECTION_HEADING = re.compile(
    r"^[#*\s]*(established(?: findings?)?|emerging(?: evidence)?|open questions?)[*\s]*(?::|$)\s*",
    re.IGNORECASE,
)
_BULLET = re.compile(r"^\s*(?:[-*\u2022]|\d+[.)])\s+")


def parse_citations(sentence: str) -> tuple[str, list[int]]:
    """Return the sentence without its markers, and the cited indices in order of appearance."""
    cited: list[int] = []
    for match in _MARKER.finditer(sentence):
        for chunk in re.split(r"\s*(?:,|;|and)\s*", match.group(1)):
            bounds = re.split(r"\s*[-\u2013]\s*", chunk)
            if len(bounds) == 2 and bounds[0].isdigit() and bounds[1].isdigit():
                low, high = int(bounds[0]), int(bounds[1])
                # A huge range is not a citation of every source; keep the ends so it fails.
                span = range(low, high + 1) if 0 < high - low <= 10 else (low, high)
                cited.extend(span)
            elif chunk.isdigit():
                cited.append(int(chunk))
    text = _MARKER.sub("", sentence)
    text = re.sub(r"\s+([.,;:!?])", r"\1", " ".join(text.split())).strip()
    return text, list(dict.fromkeys(cited))


def _section_of(heading: str) -> AnswerSection:
    lowered = heading.lower()
    if lowered.startswith("established"):
        return "established"
    if lowered.startswith("emerging"):
        return "emerging"
    return "open-questions"


@dataclass(frozen=True)
class ValidationResult:
    sentences: list[AnswerSentence]
    removed_unsupported: int


def validate_answer(raw: str, sources: Sequence[Reference]) -> ValidationResult:
    """Keep only sentences that cite retrieved sources, and nothing else.

    A sentence is dropped when it has no ``[n]`` marker, cites an index outside ``1..len(sources)``,
    carries a malformed marker such as ``[n]`` or ``[ref]``, or names a DOI, PMID or
    "Author et al." citation that is not among the retrieved sources.
    """
    known_dois = {s.doi for s in sources if s.doi}
    known_pmids = {s.pmid for s in sources if s.pmid}
    known_surnames = {
        author.split()[0].lower() for s in sources for author in s.authors if author.split()
    }

    kept: list[AnswerSentence] = []
    removed = 0
    section: AnswerSection | None = None
    for line in raw.splitlines():
        line = _BULLET.sub("", line.strip()).strip("*# ").strip()
        if not line:
            continue
        heading = _SECTION_HEADING.match(line)
        if heading:
            section = _section_of(heading.group(1))
            line = line[heading.end() :].strip()
            if not line:
                continue
        for sentence in split_sentences(line):
            text, cited = parse_citations(sentence)
            if not re.search(r"[A-Za-z]", text):
                continue  # a stray marker or punctuation, not a claim
            unsupported = (
                not cited
                or any(i < 1 or i > len(sources) for i in cited)
                or _BROKEN_MARKER.search(text) is not None
                or any(d.lower().rstrip(".,;") not in known_dois for d in _DOI.findall(text))
                or any(p not in known_pmids for p in _PMID.findall(text))
                or any(name.lower() not in known_surnames for name in _AUTHOR_YEAR.findall(text))
            )
            if unsupported:
                removed += 1
                continue
            kept.append(AnswerSentence(text=text, citations=cited, section=section))
    return ValidationResult(sentences=kept, removed_unsupported=removed)


# ---------------------------------------------------------------------------------------------
# Providers
# ---------------------------------------------------------------------------------------------


class ProviderError(Exception):
    """The provider could not produce an answer (e.g. Ollama unreachable)."""


class AnswerProvider(Protocol):
    name: ProviderName

    async def generate(self, question: str, sources: Sequence[Reference]) -> str:
        """Raw answer text with ``[n]`` markers. Validated by the caller, never trusted."""
        ...


@dataclass(frozen=True)
class ScoredSentence:
    score: float
    source_index: int
    position: int
    text: str


class ExtractiveProvider:
    """No-LLM default: quote the abstract sentences that best overlap the question.

    Each sentence is scored by the share of distinct (lightly stemmed) question terms it contains,
    with a mild length penalty so fragments and run-on sentences rank lower. Sentences are quoted
    verbatim from the abstracts, so the only thing this provider adds is the ``[n]`` marker.
    """

    name: ProviderName = "extractive"

    def __init__(self, max_sentences: int = 6, per_source: int = 2) -> None:
        self.max_sentences = max_sentences
        self.per_source = per_source

    def rank(self, question: str, sources: Sequence[Reference]) -> list[ScoredSentence]:
        terms = query_terms(question)
        if not terms:
            return []
        scored: list[ScoredSentence] = []
        for index, source in enumerate(sources, start=1):
            if not source.abstract:
                continue
            for position, sentence in enumerate(split_sentences(source.abstract)):
                text = _STRUCTURED_LABEL.sub("", sentence).strip()
                words = _WORD.findall(text.lower())
                if len(words) < 6:
                    continue
                matched = terms & {_stem(w) for w in words}
                if not matched or (len(terms) >= 3 and len(matched) < 2):
                    continue
                coverage = len(matched) / len(terms)
                length_penalty = 1.0 if len(words) <= 45 else math.sqrt(45 / len(words))
                scored.append(ScoredSentence(coverage * length_penalty, index, position, text))
        scored.sort(key=lambda s: (-s.score, s.source_index, s.position))
        return scored

    def select(self, question: str, sources: Sequence[Reference]) -> list[ScoredSentence]:
        chosen: list[ScoredSentence] = []
        per_source: dict[int, int] = {}
        for candidate in self.rank(question, sources):
            if per_source.get(candidate.source_index, 0) >= self.per_source:
                continue
            chosen.append(candidate)
            per_source[candidate.source_index] = per_source.get(candidate.source_index, 0) + 1
            if len(chosen) == self.max_sentences:
                break
        return chosen

    async def generate(self, question: str, sources: Sequence[Reference]) -> str:
        return "\n".join(f"{s.text} [{s.source_index}]" for s in self.select(question, sources))


OLLAMA_SYSTEM_PROMPT = """You summarise scientific abstracts for an educational research tool.
Rules you must follow:
- Use ONLY the numbered sources provided. Do not use outside knowledge.
- End every sentence with one or more citation markers like [1] or [2][3], using the source
  numbers given. Never cite a number that is not listed. Never write author names, years, DOIs or
  PMIDs as citations.
- Organise the answer under three headings, each on its own line:
  Established findings:
  Emerging evidence:
  Open questions:
  Put a point under "Established findings" only when systematic reviews, meta-analyses or several
  sources agree. Single studies belong under "Emerging evidence".
- Describe associations as associations. Do not claim causation unless a source reports a
  randomized trial showing it.
- Do not give medical advice, diagnoses or predictions about any individual.
- If the sources do not answer the question, say so in one sentence citing the closest source.
- At most 8 sentences in total. Plain text, no markdown."""


def build_ollama_prompt(question: str, sources: Sequence[Reference]) -> str:
    blocks = []
    for index, source in enumerate(sources, start=1):
        abstract = (source.abstract or "No abstract available.")[:1800]
        year = source.year or "n.d."
        blocks.append(
            f"[{index}] {source.title} ({year}; evidence type: {source.evidence})\n{abstract}"
        )
    return f"Question: {question}\n\nSources:\n\n" + "\n\n".join(blocks) + "\n\nAnswer:"


class OllamaProvider:
    """Optional local LLM via Ollama's ``/api/generate``. Used only when OLLAMA_URL is set."""

    name: ProviderName = "ollama"

    def __init__(
        self, http: httpx.AsyncClient, base_url: str, model: str, timeout_s: float = 60.0
    ) -> None:
        self.http = http
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s

    async def generate(self, question: str, sources: Sequence[Reference]) -> str:
        try:
            response = await self.http.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": self.model,
                    "system": OLLAMA_SYSTEM_PROMPT,
                    "prompt": build_ollama_prompt(question, sources),
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
                timeout=self.timeout_s,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Ollama was not reachable ({type(exc).__name__})") from exc
        if response.status_code != 200:
            raise ProviderError(f"Ollama answered HTTP {response.status_code}")
        try:
            text = response.json().get("response")
        except (ValueError, AttributeError) as exc:
            raise ProviderError("Ollama returned an unexpected response") from exc
        if not isinstance(text, str) or not text.strip():
            raise ProviderError("Ollama returned an empty answer")
        return text
