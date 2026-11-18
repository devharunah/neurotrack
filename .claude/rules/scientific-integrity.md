# Scientific Integrity

NeuroTrack is an educational and research tool for addiction neuroscience. These rules are not
style preferences. Breaking one is a defect, the same as a failing test.

## Never

- **Invent a citation.** Every reference needs a PMID or DOI you have actually resolved. If you
  cannot verify a source, leave a `TODO(citation)` and say so; do not guess an author or year.
- **Claim quantum advantage.** Quantum results are always shown next to classical baselines on the
  same data and split, with the caveat that toy problems demonstrate nothing about advantage.
- **Diagnose, predict an individual's relapse, recommend treatment or medication changes.**
- **Claim to measure dopamine or observe brain activity.** Reward-learning models are abstract
  mathematical models (prediction errors, values), not simulations of neurotransmitter levels.
- **Present correlation as causation.** Behavioural analytics report associations with
  uncertainty (confidence intervals, sample size), worded as associations.
- **Use real participant data before ethics approval.** Until institutional and ethical approval
  (including applicable Ugandan requirements) is documented, BehaviourLab runs on synthetic data
  only.

## Always

- Every computational model ships with a model card in `docs/models/` covering purpose,
  equations, parameters, assumptions, limitations and references.
- Every lab page shows the educational/experimental disclaimer (`src/components/disclaimer.tsx`).
- Synthetic data is labelled synthetic in the API response and in the UI.
- Participant data is pseudonymous, consented, protected by RLS, and never used to train models
  without explicit authorization and consent.
- QuantumLab stays independent of behavioural records. It never reads participant data.
