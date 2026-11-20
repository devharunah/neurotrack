# 09 · Acceptance criteria

The build is done when every item below is checked, on a PR whose `pnpm verify` is green.

## 1. Model

- [ ] Shipping asset has a licence permitting public redistribution, recorded in
      `public/models/ATTRIBUTION.md`, with an in-app credit line.
- [ ] GLB ≤ 3 MB transferred; ≤ 220k triangles; validator reports no errors.
- [ ] Six-view renders (lateral L/R, anterior, posterior, superior, inferior) show no visible
      cracks, fragments or faceting at default and 2× zoom.
- [ ] Gyri and sulci read clearly; the lateral fissure and central sulcus are identifiable.
- [ ] Every structure in the MVP set (doc 04 Levels 1–2) exists as a named node, and the Jest
      node-contract test passes.

## 2. Rendering and motion

- [ ] On load the brain appears in a three-quarter view and starts rotating slowly within 2 s of
      the model arriving, with an eased start.
- [ ] Any drag/zoom/touch stops rotation immediately; rotation resumes with easing after 4 s of
      no input; no visible snap.
- [ ] Rotate, zoom (wheel, pinch, buttons) and pan work on desktop and touch.
- [ ] Reset returns to the default view with a smooth transition; every view preset works.
- [ ] `prefers-reduced-motion`: no auto-rotate, no long camera tweens.

## 3. Selection

- [ ] Clicking/tapping a structure selects it; a drag never selects.
- [ ] The selected structure is clearly highlighted; others stay visible but recede.
- [ ] The camera frames the selection, offset so it is not hidden by the panel or sheet.
- [ ] Switching selection transitions smoothly, with no reset in between.
- [ ] Esc / empty-space click / close button deselects.
- [ ] Reward-circuit mode shows the deep structures inside a ghosted cortex, all selectable.
- [ ] The VTA is presented as an approximate location, labelled as such.

## 4. Information

- [ ] Panel shows name, side, location, primary functions, associated processes, related
      structures (clickable), references, and "Read more" where a region page exists.
- [ ] Reward-circuit entries keep their addiction-research text, worded as associations.
- [ ] Every reference has a resolved DOI or PMID; no `TODO(citation)` text is shown as fact.
- [ ] The welcome state explains how to interact and offers starting points.

## 5. Interface and responsiveness

- [ ] Stage fills the main column; panel floats on desktop (≥ 1024 px) and becomes a bottom sheet
      below that; no horizontal scroll at 360 px width.
- [ ] Every control has a visible tooltip or text and an accessible name.
- [ ] Everything works from the keyboard (browser, pill, `Esc`, `R`, `1–7`, `Space`).
- [ ] Text contrast ≥ 4.5:1 on panels; colour is never the sole carrier of meaning.
- [ ] Disclaimer visible on the page.

## 6. Resilience

- [ ] Without WebGL: a static illustration plus a fully working browser and panel.
- [ ] Model load failure: message + Retry; the rest of the page still works.
- [ ] WebGL context loss is recovered or explained.
- [ ] Deep link `?s=<slug>&view=<preset>` opens with that selection and view.

## 7. Performance

- [ ] Interactive within 3 s on broadband (cold cache) for a 2020-era laptop.
- [ ] ≥ 55 fps average while rotating on a laptop iGPU; ≥ 30 fps on a mid-range Android phone.
- [ ] No React re-render per frame (verified with the React profiler during rotation).
- [ ] No console errors or CSP violations.

## 8. Engineering

- [ ] `pnpm verify` green (lint, typecheck, Jest, Playwright), including the updated
      `e2e/neurolab.spec.ts` and new specs (deep link, fallback, mobile, reduced motion).
- [ ] Files follow repo conventions (strict TS flags, small files, Conventional Commits).
- [ ] The pipeline reproduces the GLB from the pinned source with one command.
- [ ] Independent code review and a security review of the CSP change completed.
