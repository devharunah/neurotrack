# Model card: Rescorla-Wagner

**Where:** `src/lib/models/rescorla-wagner.ts` (with `prng.ts` and `stress.ts`), UI at
`/neuro/reward-learning`, tests in `src/lib/models/__tests__/rescorla-wagner.test.ts`.
**Status:** Educational model. Runs entirely in the browser; there is no data, real or synthetic.

## Purpose

Show how a classic error-correction model of Pavlovian conditioning learns that a single cue
predicts a reward: acquisition, extinction, and the lower, noisier level reached under partial
reinforcement. It is an abstract model of learning. Its quantities are **not** simulations or
measurements of dopamine or of any other brain signal.

## Equations

For a single cue, on each trial *n*:

```
error(n) = λ(n) − V(n)
V(n+1)   = V(n) + α·β·error(n)
```

- `V` is the associative strength of the cue, starting at `V(1) = initialV` (default 0).
- `λ(n)` is the reward magnitude `λ` on a rewarded trial and 0 on a non-rewarded or extinction
  trial.
- During acquisition each trial is rewarded with probability `p`. Rewards are drawn with the
  seeded mulberry32 PRNG, so a given seed always gives the same sequence. Extinction trials never
  draw from the PRNG.

With continuous reinforcement, `V` approaches `λ` geometrically: `λ − V(n) = (1 − αβ)^(n−1)·(λ − V(1))`.
In extinction it decays towards 0 in the same way. Under partial reinforcement it fluctuates
around `p·λ`.

## Parameters

| Parameter | Range | Default (acquisition preset) | Meaning |
|---|---|---|---|
| `alpha` (α) | 0–1 | 0.5 | Salience of the cue |
| `beta` (β) | 0–1 | 0.3 | Learning rate associated with the outcome |
| `lambda` (λ) | 0–2 | 1 | Maximum associative strength the reward supports |
| `acquisitionTrials` | 0–500 | 40 | Trials in which the reward can occur |
| `extinctionTrials` | 0–500 | 0 | Following trials with no reward (λ = 0) |
| `rewardProbability` (p) | 0–1 | 1 | Chance an acquisition trial is rewarded |
| `seed` | 0–2³²−1 | 1 | PRNG seed for partial reinforcement |
| `initialV` | 0–2 | 0 | Starting associative strength |
| `stress` | see below | level 0 | **Hypothetical** modulation |

Total trials must be between 1 and 500. Inputs are validated with a zod schema
(`rwParamsSchema`); out-of-range values are rejected, not silently clamped.

## Stress: a hypothetical modulation

The stress control is a **"what if" device for exploration, not an empirical relationship.** A
unitless level `s ∈ [0, 1]` multiplies one parameter by `m(s) = 1 − 0.5·s`:

- target *reward sensitivity*: the model sees `λ·m(s)` on rewarded trials;
- target *learning rate*: the update uses `α·β·m(s)`.

The linear form, the direction of the effect and its size were chosen for illustration. They are
not taken from data and do not describe how stress affects learning in people or animals. The UI
labels the control "hypothetical modulation" for the same reason.

## Assumptions

- A single cue. The full model sums the strengths of all cues present on a trial
  (`error = λ − ΣV`), which is what lets it explain blocking and overshadowing; this
  implementation does not model compound cues.
- Learning happens once per trial. There is no notion of time within a trial (see the TD model).
- α and β are fixed for the whole run.

## Limitations

- It cannot account for several well-documented phenomena, including spontaneous recovery after
  extinction, latent inhibition, and the fact that extinction does not erase the original
  learning (Miller, Barnet & Grahame, 1995).
- It says nothing about timing within a trial, so it cannot show the prediction error moving
  from the reward to the cue.
- Parameter values are illustrative and are not fitted to any data set.
- It is a model of learning in general. It must not be read as a description of any individual
  or as a model of addiction.

## References

- Rescorla RA, Wagner AR (1972). A theory of Pavlovian conditioning: variations in the
  effectiveness of reinforcement and nonreinforcement. In: Black AH, Prokasy WF (eds),
  *Classical Conditioning II: Current Research and Theory*, pp. 64–99. New York:
  Appleton-Century-Crofts. (Book chapter; no DOI.)
- Miller RR, Barnet RC, Grahame NJ (1995). Assessment of the Rescorla-Wagner model.
  *Psychological Bulletin* 117(3), 363–386. doi:10.1037/0033-2909.117.3.363. PMID 7777644.

The DOI and PMID were resolved through the Crossref API and NCBI E-utilities on 2026-11-19.
