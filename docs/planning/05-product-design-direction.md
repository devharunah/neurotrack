# 05 · Product design direction

## 1. Visual directions considered

| Direction | Strengths | Problems for *this* product | Verdict |
|---|---|---|---|
| **Dark scientific stage** (deep ink gradient, softly lit tissue, luminous highlights) | Highlights and translucent "x-ray" ghosting read far better on dark; feels like a lab instrument; hides seams; matches the existing NeuroLab canvas colour (`#0f1b2d` ink) | Can feel "gamer" if overdone; must keep panel text contrast high | **Chosen** for the stage |
| Minimal light studio (like the user's 3rd reference: pale gradient, floor shadow) | Friendly, print-like, matches the light app shell | Translucent deep-structure view looks washed out; coloured highlights lose punch; shadows need extra render cost | Offered later as a "Light stage" toggle if wanted |
| Premium medical (white, clinical blue) | Credible | Reads clinical, which NeuroTrack must not imply | Rejected |
| Immersive full-screen (no app chrome) | Maximum focus | Breaks app navigation and the disclaimer requirement | Use only as an optional full-screen button |

**Decision:** the 3D explorer is a **dark stage inside the light app**. The app shell (sidebar,
fonts, tokens) stays; the stage fills the main column edge to edge. Panels float on the stage
as frosted "glass" cards (ink at 70–80 % with backdrop blur, 1 px hairline border).

### Material and colour

- **Tissue**: warm neutral (`#d9c3c0` family), low specular (roughness ≈ 0.6), soft wrap
  lighting and a subtle fresnel rim so the silhouette lifts off the background. Baked cavity
  darkens sulci, which is what makes folds legible without heavy post-processing.
- **Atlas colours (toggle)**: one muted categorical hue per lobe/structure, tuned for the dark
  stage and checked for colour-vision deficiency; names are always shown in text too.
- **Selection**: the selected structure takes its hue with a gentle emissive lift and a brighter
  rim; everything else **stays visible but recedes** (desaturated, darker). We do not use
  transparency for the cortex in Structures mode (folded meshes sort badly when transparent).
- **Reward-circuit mode**: cortex becomes a **fresnel "ghost"** (edges only, no depth write),
  deep structures render solid in their colours inside it.
- **Background**: radial ink gradient with a faint vignette; no grids, no particles.

### Typography

System sans (already `--font-sans`), no new font dependency. Structure name 22–24 px semibold,
tight tracking; eyebrow 11 px uppercase tracking-wide; body 14 px / 1.6; abbreviations in
`--font-mono`. Panel copy max ~60 characters per line.

## 2. Core experience

### First five seconds

1. Stage appears instantly with a soft skeleton glow and a thin progress line (model ≤ 3 MB).
2. The brain fades and scales in (400 ms ease-out) in a three-quarter left-anterior view,
   ~70 % of the stage height, slightly above centre (room for the control pill below).
3. Slow auto-rotation starts (≈ one revolution per 75–90 s), eased in over 1.5 s.
4. A single dismissible coach mark: "Drag to rotate · Scroll to zoom · Click a region to
   explore". It disappears on first interaction and is not shown again (stored in
   `localStorage`, guarded).

### Desktop layout (≥ 1024 px)

```
┌ app sidebar ┬────────────────────────── stage (full height) ──────────────────────────┐
│             │ NeuroLab · 3D brain        [Structures | Reward circuit]   [⌕ Structures]│
│             │                                                     ┌─ info panel ─────┐│
│             │                                                     │ CEREBRAL CORTEX  ││
│             │                 (brain, slowly rotating)            │ Frontal lobe  L  ││
│             │           leader line ───● label                    │ Location …       ││
│             │                                                     │ Functions …      ││
│             │                                                     │ Related ▸ chips  ││
│             │                                                     │ References       ││
│             │                                                     └──────────────────┘│
│             │  credit · disclaimer     [⟲ reset][⏸][−][+][Lateral ▾]                   │
└─────────────┴───────────────────────────────────────────────────────────────────────────┘
```

- **Info panel**: right side, 360 px, floats over the stage; the camera framing is offset so the
  selected structure is centred in the *visible* area left of the panel.
- **Structure browser** (`⌕ Structures`): opens a searchable, grouped list (Cortex / Deep /
  Cerebellum & brainstem). This is the keyboard equivalent of clicking the model and replaces
  today's always-visible list.
- **Control pill**: bottom centre. Reset view · Pause/resume rotation · Zoom out/in · View
  presets (Lateral L, Lateral R, Anterior, Posterior, Superior, Inferior, Medial). Icon buttons
  always have text tooltips and `aria-label`s.
- **Mode switch**: top centre segmented control.
- **Footer**: disclaimer one-liner + model credit (CC BY attribution), small, low contrast but
  ≥ 4.5:1.

### Tablet / mobile (< 1024 px)

- Stage takes the viewport height under the app header (`100dvh` minus header).
- Info panel becomes a **bottom sheet** with three snap points (peek: name + one line; half;
  full). The camera framing is offset upward when the sheet is at half.
- Control pill becomes a compact row; view presets collapse into a menu.
- Touch: one finger rotates, pinch zooms, two-finger drag pans. Tap selects; tap on empty space
  deselects. No hover states.

## 3. Interaction design: states and behaviour

| State | Trigger | Behaviour |
|---|---|---|
| **Loading** | Page open | Stage visible immediately; progress line; list and panel usable before the model arrives |
| **Idle** | Model ready, no input | Auto-rotate around vertical axis, eased; frame loop runs |
| **Interacting** | Pointer down / wheel / touch | Auto-rotate stops instantly; damped controls; after **4 s** idle, rotation eases back in over 1.5 s (never snaps) |
| **Hover** (pointer only) | Pointer over a structure | Lighten structure slightly; cursor pointer; small DOM tooltip with the name near the cursor. Throttled raycast |
| **Select** | Click/tap, list choice, or deep link | Highlight (hue + emissive + rim); others recede (300 ms crossfade); camera tweens (≈ 900 ms, ease-in-out) to that structure's preset or an auto-fit; panel updates with a 150 ms content crossfade; URL updates (`?s=slug`); leader-line label appears after the camera settles |
| **Switch selection** | Select another | Highlight crossfades; camera tweens from the current pose (no reset in between) |
| **Deselect** | Esc, click empty space, panel close | Highlight fades; camera stays; panel returns to the welcome state |
| **Reset** | Reset button / `R` | Tween to the default pose; clears selection |
| **View preset** | Pill menu / keys `1–7` | Tween to preset; keeps selection |
| **Mode switch** | Segmented control | Structures ⇄ Reward circuit: cortex material crossfades between tissue and ghost over 600 ms; list and panel content switch; selection kept if valid in both modes |
| **Isolate** (Phase 2) | Panel button | Hide everything except the selection and its group |
| **Reduced motion** | OS setting | No auto-rotate; camera moves are instant cuts with a short fade; frame loop on demand |
| **No WebGL / scene crash** | Detection or error boundary | Stage replaced by a static illustration with the structure browser and panel fully usable |
| **Model load failure** | Network/parse error | Inline message in the stage with Retry; browser and panel still work |

### Welcome panel (nothing selected)

Title "Explore the brain", two-sentence orientation, three suggested starting points as chips
(e.g. "Frontal lobe", "Cerebellum", "Nucleus accumbens → reward circuit"), and the interaction
hints. This doubles as the first-time explanation that the model is interactive.

### Info panel content model (selected)

1. Eyebrow: group ("Cerebral cortex · Lobe" / "Basal ganglia" / "Reward circuit")
2. Name + side chip (Left / Right / Bilateral) + abbreviation
3. **Location**: one or two sentences in plain language with directional terms explained
4. **Primary functions**: 3–5 bullets
5. **Associated processes**: short paragraph (e.g. language, motor planning)
6. **In addiction research** (reward-relevant structures only): worded as findings and
   associations, never causes (existing copy in `brain-regions.ts`)
7. **Related structures**: chips that select those structures
8. **References**: resolved DOI/PMID links; "Read more" to `/neuro/regions/[slug]`

## 4. Communicating interactivity

- Auto-rotation itself signals "this is 3D".
- Coach mark on first visit.
- Hover tooltips on desktop.
- Welcome panel's suggested chips (a one-click entry that demonstrates selection + camera
  move).

## 5. Accessibility commitments

- Every action available from the keyboard: the structure browser, the control pill and
  shortcuts (`Esc`, `R`, `1–7`, `Space` = pause rotation).
- Panel is an `aria-live="polite"` region; canvas keeps `role="img"` with a dynamic label naming
  the current selection and view.
- Colour is never the only carrier of meaning; text contrast ≥ 4.5:1 on glass panels.
- `prefers-reduced-motion` honoured as specified above.
