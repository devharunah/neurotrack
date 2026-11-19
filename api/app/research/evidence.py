"""Evidence labels derived from publication types.

The label is the *type* of evidence a record reports, read from the publication-type metadata
that PubMed and Europe PMC attach. It is not a quality grade: a poorly run meta-analysis is still
a meta-analysis, and an excellent cohort study is still a primary study.
"""

from collections.abc import Iterable

from app.research.schemas import EvidenceLabel

_SYSTEMATIC = ("systematic review", "meta-analysis", "meta analysis", "metaanalysis")
_RCT = ("randomized controlled trial", "randomised controlled trial")
_REVIEW = ("review",)
# Records that report no study of their own.
_NON_STUDY = (
    "editorial",
    "comment",
    "letter",
    "news",
    "erratum",
    "published erratum",
    "retraction of publication",
    "biography",
    "portrait",
    "lecture",
    "interview",
)
_PRIMARY = (
    "journal article",
    "research article",
    "research-article",
    "clinical trial",
    "observational study",
    "comparative study",
    "case reports",
    "multicenter study",
    "evaluation study",
    "validation study",
    "twin study",
    "controlled clinical trial",
    "pragmatic clinical trial",
    "preprint",
)


def _normalise(publication_type: str) -> str:
    return " ".join(publication_type.lower().replace("_", " ").split())


def evidence_label(publication_types: Iterable[str]) -> EvidenceLabel:
    types = [_normalise(t) for t in publication_types]
    if any(marker in t for t in types for marker in _SYSTEMATIC):
        return "systematic-review/meta-analysis"
    if any(marker in t for t in types for marker in _RCT):
        return "randomized-trial"
    if any(marker in t for t in types for marker in _REVIEW):
        return "review"
    # PubMed tags comments and letters with "Journal Article" too, so check non-studies first.
    if any(t in _NON_STUDY for t in types):
        return "other"
    if any(t in _PRIMARY or t.startswith("clinical trial") for t in types):
        return "primary-study"
    return "other"
