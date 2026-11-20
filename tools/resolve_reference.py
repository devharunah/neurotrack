"""Resolve DOIs against Crossref and PubMed and print citation metadata.

    python tools/resolve_reference.py 10.1038/nrn2555 10.1146/annurev.neuro.24.1.167

For each DOI prints the Crossref record (authors, year, title, journal, volume, pages) and the
PMID that NCBI E-utilities returns for it, as a JSON line. Content in src/lib/content/ must be
copied from this output, never written from memory (.claude/rules/scientific-integrity.md).
Exit code 1 if any DOI fails to resolve.
"""

import json
import sys
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "neurotrack-reference-resolver/1.0"}


def get_json(url: str) -> dict:
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def crossref(doi: str) -> dict:
    item = get_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi)}")["message"]
    authors = item.get("author", [])
    names = [
        f"{a.get('family', '')} {''.join(p[0] for p in a.get('given', '').replace('-', ' ').split())}"
        for a in authors
    ]
    year = (item.get("published-print") or item.get("published-online") or item["issued"])[
        "date-parts"
    ][0][0]
    return {
        "doi": item["DOI"],
        "authors": ", ".join(names[:6]) + (" et al." if len(names) > 6 else ""),
        "author_count": len(names),
        "year": year,
        "title": (item.get("title") or [""])[0],
        "journal": (item.get("container-title") or [""])[0],
        "volume": item.get("volume", ""),
        "pages": item.get("page", ""),
    }


def pubmed_id(doi: str) -> str | None:
    term = urllib.parse.quote(f"{doi}[doi]")
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term={term}&retmode=json"
    ids = get_json(url)["esearchresult"]["idlist"]
    return ids[0] if len(ids) == 1 else None


def main(dois: list[str]) -> int:
    failed = 0
    for doi in dois:
        try:
            record = crossref(doi)
            time.sleep(0.4)  # NCBI asks for at most 3 requests per second without a key
            record["pmid"] = pubmed_id(doi)
        except Exception as error:  # noqa: BLE001 - report and continue with the next DOI
            record = {"doi": doi, "error": str(error)}
            failed += 1
        sys.stdout.buffer.write((json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8"))
        time.sleep(0.4)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
