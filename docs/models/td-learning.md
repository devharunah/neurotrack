# Model card: temporal-difference learning, TD(0)

**Where:** `src/lib/models/td-learning.ts` (with `prng.ts` and `stress.ts`), UI at
`/neuro/reward-learning`, tests in `src/lib/models/__tests__/td-learning.test.ts`.
**Status:** Educational model. Runs entirely in the browser; there is no data, real or synthetic.

## Purpose

Show the textbook result of temporal-difference learning in a conditioning trial: early in
learning the prediction error δ occurs when the reward arrives; as the cue comes to predict the
reward, δ at reward time shrinks and δ moves to the time of the cue. Schultz, Dayan & Montague
(1997) pointed out that the responses of many midbrain dopamine neurons recorded in monkeys
during conditioning resemble this shift. **The model's δ is a model quantity. It is not a
simulation or measurement of dopamine release, firing or concentration.**

## Equations

Time within a trial is discrete. The cue appears at step 0 and the reward `r` at step `D`
(`delaySteps`). Each step after cue onset is its own state (a complete serial compound, or
tapped delay line), with a learnable value `V(t)` for `t = 0 … D−1`. The pre-cue state has value
0 and is not learned, because the cue arrives at an unpredictable time. The trial ends at the
reward, so `V(D) = 0`.

For each step `t = 0 … D` of each trial:

```
δ(t)       = r(t) + γ·V(t) − V(t−1)        with V(−1) = 0 and V(D) = 0
V(t−1)    ← V(t−1) + α·δ(t)                 for t ≥ 1
```

`r(t)` is `r` at `t = D` on a rewarded trial and 0 otherwise. With continuous reward, the values
converge to `V(t) = γ^(D−1−t)·r`, δ at reward time goes to 0, and δ at the cue goes to `γ^D·r`.
When a reward is omitted after learning, δ at reward time is negative.

Rewards are drawn with the seeded mulberry32 PRNG when the reward probability is below 1, so a
given seed always gives the same run.

## Parameters

| Parameter | Range | Default (UI) | Meaning |
|---|---|---|---|
| `alpha` (α) | 0–1 | 0.2 | Learning rate |
| `gamma` (γ) | 0–1 | 0.98 | Discount per time step |
| `reward` (r) | 0–2 | 1 | Reward magnitude |
| `delaySteps` (D) | 1–20 | 6 | Steps from cue onset to reward |
| `trials` | 1–500 | 120 | Number of trials |
| `rewardProbability` | 0–1 | 1 | Chance a trial is rewarded |
| `seed` | 0–2³²−1 | 1 | PRNG seed |
| `stress` | see below | level 0 | **Hypothetical** modulation |

Inputs are validated with a zod schema (`tdParamsSchema`); out-of-range values are rejected.

## Stress: a hypothetical modulation

The stress control is a **"what if" device for exploration, not an empirical relationship.** A
unitless level `s ∈ [0, 1]` multiplies one parameter by `m(s) = 1 − 0.5·s`:

- target *reward sensitivity*: the model receives `r·m(s)`;
- target *learning rate*: the update uses `α·m(s)`.

The linear form, the direction and the size of the effect were chosen for illustration. They are
not taken from data and do not describe how stress affects learning or the brain. The UI labels
the control "hypothetical modulation" for the same reason.

## Assumptions

- A single cue at a fixed delay before a single reward, in an otherwise empty trial.
- A complete serial compound state representation: every time step after the cue is a separate,
  perfectly timed state. Real timing is noisy, and other representations (for example
  microstimuli or belief states) change the predictions.
- Tabular TD(0) with no eligibility traces, so credit moves back one step per trial.
- Fixed α and γ for the whole run.

## Limitations

- The gradual, step-by-step backward movement of δ through the delay is a property of TD(0) with
  this representation. Variants with eligibility traces or other state representations predict
  different time courses, and this simulator cannot say which matches neural data.
- It is a model of prediction learning only: no actions, no choices, no motivation or
  homeostatic state.
- Parameter values are illustrative and are not fitted to any data set.
- The resemblance to dopamine neuron recordings is a qualitative correspondence reported in the
  literature, not something this simulator demonstrates. It says nothing about any individual
  and is not a model of addiction.

## References

- Sutton RS (1988). Learning to predict by the methods of temporal differences. *Machine
  Learning* 3(1), 9–44. doi:10.1007/BF00115009.
- Schultz W, Dayan P, Montague PR (1997). A neural substrate of prediction and reward.
  *Science* 275(5306), 1593–1599. doi:10.1126/science.275.5306.1593. PMID 9054347.

DOIs were resolved through the Crossref API and the PMID through NCBI E-utilities on 2026-11-19.
