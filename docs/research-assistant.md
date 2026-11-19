# Research Assistant

The Research Assistant (`/research`) searches the biomedical literature and answers questions
using only abstracts it has actually retrieved. It needs **no paid AI provider and no LLM at all**.
An optional local Ollama model can write more fluent answers, under the same citation checks.

| Piece | Where |
|---|---|
| Source clients, parsing, dedup | `api/app/research/sources.py` |
| Evidence labels | `api/app/research/evidence.py` |
| Answer providers and citation validator | `api/app/research/summarize.py` |
| Orchestration and routes | `api/app/research/service.py`, `router.py` |
| Database (cache, saved, history) | `supabase/migrations/20261120000100_research.sql` |
| Web app | `src/app/(app)/research/`, `src/lib/research/` |

## Data sources and their terms of use

### Europe PMC

- Endpoint: `GET https://www.ebi.ac.uk/europepmc/webservices/rest/search` with `format=json` and
  `resultType=core`, which includes abstracts, authors, journal and publication types.
- Free and key-less. Europe PMC asks for reasonable, non-abusive use of its web services and does
  not publish a fixed per-second limit for search. NeuroTrack sends **one** Europe PMC request per
  search or question, and retries only on HTTP 429 and 5xx.
- Content: bibliographic metadata and abstracts come from the publishers and from MEDLINE. The
  abstracts remain under their authors' or publishers' copyright. NeuroTrack shows them for
  reading and links to the original; it does not republish full text.
- Docs and terms: <https://europepmc.org/RestfulWebService>,
  <https://europepmc.org/Copyright>.

### PubMed (NCBI E-utilities)

- `esearch.fcgi` (`db=pubmed`, `retmode=json`, `sort=relevance`) finds PMIDs, then `efetch.fcgi`
  (`retmode=xml`, `rettype=abstract`) fetches the records in one batch. Every request carries
  `tool=neurotrack`.
- **Rate limit.** NCBI allows 3 requests per second without an API key and 10 with one. All
  E-utilities calls in an API process go through one shared limiter that spaces them at least
  1/3 s apart (1/10 s when `NCBI_API_KEY` is set). A search costs two requests.
- NCBI also asks tools to send a contact `email`. NeuroTrack deliberately **does not**: it never
  sends a user's email or any other personal data upstream. The `tool` parameter and the
  User-Agent identify the software instead. If NCBI ever needs to contact the operator of a
  deployment, the operator should register an API key, which ties requests to their NCBI account.
- PubMed abstracts can be copyrighted by their publishers; NLM's disclaimer applies.
- Docs and terms: <https://www.ncbi.nlm.nih.gov/books/NBK25497/>,
  <https://www.ncbi.nlm.nih.gov/home/about/policies/>.

### What every outbound request looks like

- `User-Agent: NeuroTrack/0.1 (open-source research platform)`, set on every request.
- The query text and the source-specific parameters. Nothing else: no user id, email, token or IP
  forwarding headers.
- Timeouts (15 s per request by default, `RESEARCH_TIMEOUT_S`), at most 3 attempts, exponential
  backoff (0.5 s, 1 s) that honours `Retry-After` up to 10 s. Other 4xx responses are not retried.
- If one source fails, results from the other are returned with `failed_sources` set, and the UI
  says which database did not answer. If both fail, the API answers 502 and the UI says so.

## Normalisation, dedup and evidence labels

Both sources are normalised to one `Reference`: `source`, `pmid`, `pmcid`, `doi` (lowercase, no
resolver prefix), `title`, `authors[]`, `journal`, `year`, `abstract` (markup stripped; structured
abstract sections kept as `Methods: …`), `publication_types[]`, `url` and `evidence`.

Results from the two sources are interleaved (so each source's top hits stay near the top) and
deduplicated by PMID or DOI. When the same publication appears twice, the first record is kept
and missing fields (abstract, identifiers, publication types) are filled from the duplicate.

The **evidence label** is read from publication-type metadata:

| Label | Typical publication types |
|---|---|
| `systematic-review/meta-analysis` | Systematic Review, Meta-Analysis |
| `randomized-trial` | Randomized Controlled Trial |
| `review` | Review, review-article |
| `primary-study` | Journal Article, research-article, Clinical Trial, Observational Study, Case Reports, Preprint |
| `other` | Editorial, Comment, Letter, News, Erratum, or nothing reported |

It describes the **type of evidence, not its quality**. A weak meta-analysis is still a
meta-analysis; an excellent cohort study is still a primary study. The UI says this next to every
list of results, and badges use neutral colours so they do not read as a ranking.

## Answer providers

`POST /research/answer` retrieves up to `3 × max_sources` records from both sources, keeps those
that have an abstract, and passes the first `max_sources` (at most 8) to a provider.

- **`ExtractiveProvider` (default, no LLM).** Splits each abstract into sentences (aware of
  abbreviations such as "et al." and "e.g."), strips structured-abstract labels, and scores each
  sentence by the share of the question's content terms it contains (lowercased, light suffix
  stemming, stopwords removed), with a mild penalty for very long sentences. Sentences under six
  words, and sentences matching fewer than two terms of a 3+ term question, are ignored. It keeps
  at most six sentences, at most two per source, and quotes each **verbatim**, tagged `[n]` with
  its source index. Nothing is paraphrased, so the only thing it adds is the marker.
- **`OllamaProvider`** is used only when `OLLAMA_URL` is set (`OLLAMA_MODEL`, default
  `llama3.2`). It calls `/api/generate` with temperature 0.1 and a system prompt that requires: use
  only the numbered sources; end every sentence with `[n]` markers; never cite by author, year,
  DOI or PMID; organise the answer under *Established findings*, *Emerging evidence* and *Open
  questions*; word associations as associations; no medical advice or statements about
  individuals. If Ollama is unreachable, errors, or produces no sentence that survives validation,
  the API falls back to the extractive answer and says why in `provider_note`.

## How citations are validated

The provider's raw text is never trusted, whichever provider ran. `validate_answer` splits it into
sentences and **keeps a sentence only if**:

1. it has at least one `[n]` marker (`[1]`, `[1, 3]`, `[2][3]`, `[1-3]` are understood);
2. every cited index is between 1 and the number of retrieved sources (a huge range such as
   `[1-40]` counts as citing 40);
3. it contains no malformed marker such as `[n]`, `[ref]` or `[source]`;
4. any DOI or PMID written in the sentence belongs to a retrieved source; and
5. any "Surname et al. (year)" citation names an author of a retrieved source.

Everything else is dropped, and the count is returned as `removed_unsupported` and shown in the
UI. Markers are stripped from the kept text and returned as structured `citations`, so the browser
renders them from data, not from model output. The web app checks the indices once more before
turning them into links (`src/lib/research/citations.ts`), so a marker can never point at nothing.
Each `[n]` scrolls to, focuses and briefly highlights source *n*.

`api/tests/test_research.py` feeds the validator adversarial model output (out-of-range and zero
indices, uncited claims, fabricated DOIs and PMIDs, unknown "et al." citations, `[n]`
placeholders, overreaching ranges) and checks exactly which sentences survive.

## Storage

- `literature_references` is a shared, append-only cache of public bibliographic data. PMID and
  DOI are each unique when present (NULLs never collide), and at least one is required. A
  generated `tsvector` (title weight A, abstract weight B, English configuration) with a GIN index
  powers **Search my library**, which uses PostgREST `textSearch` in `websearch` mode (quotes,
  `or`, `-word`). Signed-in users can select and insert; nobody can update or delete.
  `cache_literature_references(jsonb)` inserts a batch with `on conflict do nothing` (covering
  both unique keys) and returns the cached id of every record, new or existing.
- `saved_references` (`note` up to 2000 characters) and `research_queries` are private: RLS limits
  every operation to the owner's rows. Only the note of a saved reference can be changed.
- Caching never blocks a search. If the cache is unavailable, results are still shown and saving
  is disabled with a message.

## Configuration

| Variable (`api/.env`) | Default | Effect |
|---|---|---|
| `NCBI_API_KEY` | unset | Raises the PubMed limit from 3 to 10 requests/s. |
| `OLLAMA_URL` | unset | Enables the Ollama provider, e.g. `http://127.0.0.1:11434`. |
| `OLLAMA_MODEL` | `llama3.2` | Model name passed to Ollama. |
| `RESEARCH_TIMEOUT_S` | `15` | Per-request timeout for Europe PMC and NCBI. |
| `OLLAMA_TIMEOUT_S` | `60` | Timeout for one Ollama completion. |

## Limitations

- **Retrieval is a small, unranked sample.** Answers use at most 8 abstracts chosen by the search
  engines' relevance ordering. This is not a systematic search, and absence of a finding means
  nothing.
- **Validation checks provenance, not truth.** A kept sentence cites a source that was retrieved,
  and an extractive sentence is quoted from that source. With Ollama, the server cannot prove the
  cited abstract actually supports a paraphrased claim; read the source.
- **Abstracts only.** Full texts, figures, limitations sections and retractions are not read.
  Check the original record (DOI, PubMed, Europe PMC links are on every card).
- **Lexical scoring.** The extractive provider matches words, not meaning. Synonyms
  ("craving" vs "urge") and negation are not understood, and the sentence order follows score, not
  argument.
- **Evidence labels depend on metadata.** Publication types are assigned by indexers and
  publishers, are sometimes missing or late (new records are often only "Journal Article"), and
  say nothing about quality, sample size or risk of bias.
- **The cache is append-only.** Corrections or retractions published after a record was cached
  are not reflected until the cache is refreshed by an administrator.
- **Records without a PMID or DOI** (some preprints) are shown but cannot be cached or saved.
- **Library search** is ordered by publication year, not text relevance (PostgREST cannot order
  by `ts_rank` without an RPC).
- Nothing here is medical advice, and nothing describes or predicts anything about an individual.
