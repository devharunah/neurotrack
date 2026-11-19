# Model card: BehaviourLab association analysis

**Where:** `api/app/behaviour/stats.py`, exposed as `POST /behaviour/associations` and
`POST /behaviour/summary`. The UI is the *Trigger analysis* panel on `/behaviour/studies/[id]`.
**Status:** Research and teaching tool. It runs on synthetic data until a study records an
ethics approval reference (enforced in the database).

## Purpose

Describe, for a study group as a whole, how strongly self-reported craving intensity moves
together with stress, sleep quality, mood and time of day, and how uncertain each estimate is.

It is **not** a causal model, a diagnostic tool or a predictor. It never produces a score, label or
forecast for an individual participant, and nothing it reports should be read as "X causes
craving".

## Data

Each request carries pseudonymous observation rows, already filtered by row-level security to a
study the caller is a member of:

| Field | Type | Notes |
|---|---|---|
| `observed_at` | ISO 8601 with UTC offset | Sent as local study time, so the hour is the participant's wall-clock hour |
| `participant` | opaque key, optional | A per-request index (`k0`, `k1`, …), not the pseudonym. Used only for the cluster bootstrap |
| `mood`, `stress`, `sleep_quality`, `craving_intensity` | integer 0–10 or null | Null means "not answered" |

Up to 20,000 rows per request (the most recent ones if a study has more). Out-of-range values,
fractional scores, malformed keys and missing auth are rejected (422 / 401). The API is
stateless: it stores nothing.

Synthetic studies use `src/lib/behaviour/synthetic.ts`, a seeded generator whose built-in
associations are documented in that file (craving rises with stress, in the evening and at social
venues, and falls with sleep quality and mood). Finding them again demonstrates that the pipeline
works. It says nothing about real people.

## Method

### Numeric pairs: stress–craving, sleep–craving, mood–craving

1. Keep the rows where both scores are present (pairwise deletion). This gives `n`.
2. **Spearman's ρ** (Spearman, 1904): the Pearson correlation of the average (mid) ranks, so ties,
   which are common on a 0–10 scale, are handled. The p-value is from `scipy.stats.spearmanr`
   (a t approximation).
3. **95% confidence interval:** a percentile bootstrap (Efron, 1979) with 1,000 resamples and a
   fixed seed, so the same rows always give the same interval. Percentile intervals for
   correlations behave reasonably for non-normal data at moderate n (Bishara & Hittner, 2017).
   - When every row carries a participant key, **whole participants are resampled** (a cluster
     bootstrap; Field & Welsh, 2007). Repeated check-ins from one person are not independent, and
     resampling single observations would make the interval too narrow.
   - Otherwise, single observations are resampled and the response says so
     (`bootstrap_unit: "observation"`).
4. **Implementation note.** Because every score is an integer from 0 to 10, a sample is fully
   described by an 11 × 11 table of counts. Resampling rows is equivalent to drawing a multinomial
   table, and resampling participants to summing their tables with multinomial weights. ρ is then
   computed exactly from each table. This gives identical statistics to ranking the raw rows (a
   unit test checks it against SciPy) at a fraction of the cost, so 20,000 rows take well under a
   second.

### Time of day and craving

Hours are grouped into four buckets of local time: night 00–05, morning 06–11, afternoon 12–17 and
evening 18–23. Time of day is not ordinal in a meaningful way, so instead of ρ this pair uses a
**Kruskal–Wallis H test** (Kruskal & Wallis, 1952), tie-corrected, with the rank effect size
**ε² = H / (n − 1)**. ε² runs from 0 (no difference between buckets) to 1. Its CI is a bootstrap
in the same way as ρ, and the response includes each bucket's n, mean and median.

### Multiple comparisons

Four pairs are tested at once. Alongside each raw p-value, the API returns a Holm step-down
adjusted p-value (Holm, 1979; TODO(citation): no DOI could be resolved through Crossref for
*Scand. J. Statist.* 6(2):65–70, so it is not linked). The UI shows the adjusted value.

### Guards

- `min_n = 10`. Below that, or when either score never varies, the pair returns
  `sufficient: false`, null estimates and the reading "Insufficient data", never a number.
- A fixed `notice` ("Associations, not causes…") is returned with every response and is also
  rendered by the UI independently of the API.
- The `synthetic` flag of the request is echoed in the response and the UI labels results
  accordingly.

### Wording

The `interpretation` string names a size and a direction only, using conventional cut-offs:
|ρ| < 0.1 negligible, < 0.3 weak, < 0.5 moderate, otherwise strong. For ε²: < 0.01 negligible,
< 0.06 weak, < 0.14 moderate, otherwise strong (a common rule of thumb for ε², TODO(citation):
the usual source, Tomczak & Tomczak (2014) in *Trends in Sport Sciences*, has no Crossref DOI and
is not linked). When the CI includes zero, the reading adds that even the direction is uncertain.
These words describe size, not clinical or practical importance.

`POST /behaviour/summary` returns, per numeric field: n, missing count and fraction, mean, sample
SD (ddof = 1), minimum, quartiles (linear interpolation) and maximum.

## Assumptions

- Observations are a fair sample of participants' moments. Ecological momentary assessment reduces
  recall bias but does not remove it, and missed prompts are rarely missing at random
  (Shiffman, Stone & Hufford, 2008).
- The 0–10 scores are treated as ordinal. Spearman's ρ only uses their order.
- Participants are independent of each other. Within-person dependence is handled only by the
  cluster bootstrap. ρ itself pools within-person and between-person variation into one number.
- The four time buckets and the study's single time zone describe participants' local time.

## Limitations

- **Confounding.** Every association here can be produced, hidden or reversed by factors that were
  not measured (day of week, work, illness, other people, other substances). Nothing here supports
  a causal claim.
- **Multiple comparisons.** Four pairs are tested on the same data. Holm adjustment controls the
  family-wise error rate for these four only. Repeatedly re-running the analysis while data
  accumulates, or adding custom questions and testing them by eye, is not covered.
- **Self-report bias.** Scores are subjective and can be shaped by social desirability, mood at the
  time of reporting and reactivity to being asked. Voluntary fields such as substance use are not
  analysed here, partly because non-response is informative.
- **Pooling within and between people.** A group-level ρ can differ in size and even in sign from
  any one person's within-person relationship (the ecological fallacy). This is one more reason
  results must never be applied to an individual.
- **Missing data.** Pairwise deletion assumes answers are missing at random. The dashboard's
  missing-observation view should be checked before reading the associations.
- **Few participants.** With a cluster bootstrap and only a handful of participants, intervals are
  unstable and can be too narrow. Treat studies with fewer than about 10 participants as
  exploratory, whatever the observation count.
- **Bucketed time.** The four time-of-day buckets are a fixed, coarse choice. Different boundaries
  can give different ε².

## References

- Bishara, A. J., & Hittner, J. B. (2017). Confidence intervals for correlations when data are not
  normal. *Behavior Research Methods*, 49(1), 294–309.
  [doi:10.3758/s13428-016-0702-8](https://doi.org/10.3758/s13428-016-0702-8)
- Efron, B. (1979). Bootstrap methods: another look at the jackknife. *The Annals of Statistics*,
  7(1), 1–26. [doi:10.1214/aos/1176344552](https://doi.org/10.1214/aos/1176344552)
- Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. *Journal of the Royal
  Statistical Society: Series B*, 69(3), 369–390.
  [doi:10.1111/j.1467-9868.2007.00593.x](https://doi.org/10.1111/j.1467-9868.2007.00593.x)
- Kruskal, W. H., & Wallis, W. A. (1952). Use of ranks in one-criterion variance analysis.
  *Journal of the American Statistical Association*, 47(260), 583–621.
  [doi:10.1080/01621459.1952.10483441](https://doi.org/10.1080/01621459.1952.10483441)
- Shiffman, S., Stone, A. A., & Hufford, M. R. (2008). Ecological momentary assessment. *Annual
  Review of Clinical Psychology*, 4, 1–32.
  [doi:10.1146/annurev.clinpsy.3.022806.091415](https://doi.org/10.1146/annurev.clinpsy.3.022806.091415)
- Spearman, C. (1904). The proof and measurement of association between two things. *The American
  Journal of Psychology*, 15(1), 72–101. [doi:10.2307/1412159](https://doi.org/10.2307/1412159)

All six DOIs were resolved through the Crossref API (`https://api.crossref.org/works/<doi>`) on
2026-11-19. Holm (1979) and Tomczak & Tomczak (2014) are marked `TODO(citation)` above because
Crossref has no record for them.
