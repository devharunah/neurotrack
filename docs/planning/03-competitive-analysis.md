# 03 · Competitive analysis and differentiation

Evidence for every cell is in [02-competitor-research.md](02-competitor-research.md).
**[V]** verified at a source · **[I]** inferred (not observed, because WebGL apps could not be run).

## Comparison matrix

| Area | BrainFacts 3D | BioDigital Human | Visible Body | Zygote Body | Z-Anatomy | Complete Anatomy (Brain) |
|---|---|---|---|---|---|---|
| 3D model quality | Custom shader, AO maps, runtime subdivision [V]; look not observed [I] | Draco/KTX2 glTF pipeline [V]; high fidelity [I] | High [I] | Medium, 2010-era [I] | BodyParts3D-derived, medium [I] | Gyri map layer [V]; high [I] |
| Anatomical detail (brain) | 59 structures incl. NAc, **no VTA** [V] | 14k whole-body structures [V]; brain depth unknown | Brain, limbic, thalamus, cerebellum views [V] | Labelled, searchable [V] | 5k+ structures [V] | Gyri + 45 cross-sections [V] |
| Interactive selection | Click/tap, hover glow, search [V] | Select / Hide / Fade, isolate, X-ray, paint [V] | Yes [I] | Search, transparency [V] | Not observed | Select → info [V] |
| Rotation & navigation | Orbit, zoom, per-structure camera tweens, reset, auto-rotate [V] | Orbit, pan, zoom, momentum, chapter cameras [V] | Not observed | Zoom, layer slider [V] | Not observed | Rotate, zoom [V] |
| Educational information | 50–100 words + some refs, intro tour [V] | Descriptions, quizzes, tours [V] | Quizzes, flashcards, tours, LMS [V] | Labels only [V] | 3.5k definitions [V] | Descriptions, slices [V] |
| UI/UX quality | Elegant leader lines [V]; dated stack [V] | Polished [I] | Polished [I] | Dated [I] | Unity-style dark UI [V/I] | Polished [I] |
| Mobile | Responsive, low-texture mode, touch [V] | Native apps + web [V] | Apps; web needs 4 GB RAM [V] | Unknown (site down) | DPR forced to 1 [V] | App [V] |
| Performance | Sequential script loading, no fallback [V] | 4.2 MB app bundle [V]; streaming [I] | 30 Mbps recommended [V] | Light [I] | Unity WASM, heavy [I] | Native [I] |
| Cost / openness | Free, closed [V] | Limited free tier [V] | Paid [V] | Historically freemium [V] | Free, CC BY-SA [V] | Paid [I] |

## Per-platform critique

| | Do well | Adopt | Weaknesses / dated | Avoid copying |
|---|---|---|---|---|
| **BrainFacts** | Reviewed content; camera preset per structure; leader-line labels; fade-the-rest | Data-driven structure config; 0.1–0.2 context fade; snapshot | three.js r85 + jQuery Mobile; blocking 8-step modal tour; no WebGL fallback; no circuits | The modal tour; CMS-coupled content |
| **BioDigital** | Breadth; chapter tours with cameras; embed API | Select / Hide / Fade / X-ray vocabulary; chapter cameras; angle-fading labels | Paywall narrowing; generalist; heavy bundle | Account walls, save caps, tool overload |
| **Visible Body** | Curriculum, quizzes, LMS | Assessment ideas (later) | 4 GB / 30 Mbps requirements; closed | Multi-GB installs |
| **Zygote Body** | Layer/depth slider | Layer slider as "depth" control | 2010 UI; thin text | — |
| **Z-Anatomy** | Truly open meshes | Asset source option | Unity canvas UI: inaccessible, heavy | Canvas-only UI |
| **Complete Anatomy** | 2D slice ↔ 3D link | Coronal slice view (later phase) | Paid, app-only | — |

## Where we can be better

Ranked by value to NeuroTrack's learners (addiction neuroscience students, researchers,
health professionals) against cost.

| # | Opportunity | Why it matters | Phase |
|---|---|---|---|
| 1 | **Real anatomy, reward circuit inside it.** Atlas-derived lobes and gyri *plus* the deep structures (NAc, amygdala, hippocampus, caudate/putamen, substantia nigra, midbrain tegmentum) visible inside a ghosted cortex | No free tool shows the reward circuit in real anatomical context. BrainFacts lacks the VTA; others are generalist | MVP |
| 2 | **Instant and light.** ≤ 3 MB model, interactive in < 3 s on broadband, works on mid-range phones | Competitors demand GBs, 4 GB RAM or app installs | MVP |
| 3 | **Accessible DOM interface.** Keyboard structure tree, screen-reader descriptions, reduced-motion behaviour, list-only fallback without WebGL | Canvas-only apps (Unity) and BrainFacts' no-fallback cannot match it | MVP (mostly exists) |
| 4 | **Evidence-linked panels.** Every claim traceable to a resolved DOI/PMID | NeuroTrack's integrity rule, and a credibility edge over un-cited competitors | MVP |
| 5 | **Fluid camera choreography.** Per-structure framing tween on select, graceful auto-rotate resume, preset views | Proven by BrainFacts and BioDigital; we can make it smoother with damped controls | MVP |
| 6 | **Depth control: Surface → Lobes → Deep structures** (Zygote's layer idea, made explicit) | Answers "where is it *inside*?", the hardest question for learners | MVP |
| 7 | **Shareable deep links** (`?s=nucleus-accumbens&view=medial`) | Teachers can link a precise view | MVP (cheap) |
| 8 | **Animated pathways** (mesolimbic, mesocortical, nigrostriatal) as flowing tubes | Teaches connections, not just parts | Phase 2 |
| 9 | **Guided chapters** for the Koob & Volkow addiction cycle (binge/intoxication → withdrawal/negative affect → preoccupation/anticipation), each with a camera and emphasis | Reuses verified content already in `brain-regions.ts` | Phase 2 |
| 10 | **Micro-quizzes in 3D** ("click the structure that…") | Retrieval practice; competitors charge for quizzes | Phase 3 |
| 11 | **Coronal slice view** linked to the 3D model | Helps read neuroimaging figures | Phase 3 |

## Deliberately not doing

- **Whole-body scope.** We are a brain explorer in an addiction-neuroscience platform.
- **Hundreds of selectable gyri in the default view.** Too much for learners; gyri stay as an
  optional "detail" level later.
- **Modal tours.** We use a single dismissible coach mark.
- **Sensational framing** ("hijacked brain", lurid reds). Findings are worded as associations,
  consistent with `.claude/rules/scientific-integrity.md`.
- **Post-processing for its own sake.** Effects ship only if they measurably help legibility
  and keep mobile frame rates (see [06](06-technical-architecture.md)).
