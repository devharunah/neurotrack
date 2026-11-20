# 02 · Competitor research

Researched 2026-11-20.

## Method and its limits (read this first)

The research tool can fetch HTML and JavaScript but **cannot run a WebGL application or see a
rendered frame**. So instead of "using" each product, we did the next best thing:

- read product, help and documentation pages;
- downloaded the public front-end code of BrainFacts (fully readable), BioDigital (minified,
  searched for strings) and Z-Anatomy (Unity loader) and read what they reveal;
- read secondary sources (Wikipedia, reviews, institutional help pages).

Labels: **[V]** verified at the linked source · **[I]** inferred or assumed, not verified.
Anything about how a model *looks* or how an interaction *feels* is [I] unless a source says it.

Blocked during research: zygotebody.com (connection refused twice), some
support.biodigital.com articles (403), developer.biodigital.com (single-page app, no fetchable
content), free3d.com (403).

**Recommended follow-up (human, 30 min):** open BrainFacts 3D Brain, BioDigital Human (free
account) and Z-Anatomy web in a browser on desktop and phone, and note the felt quality of
rotation, selection and transitions. Those findings would upgrade several [I] cells below.

---

## 1. BrainFacts.org 3D Brain (Society for Neuroscience): closest analogue

<https://www.brainfacts.org/3d-brain>, free, no login [V].

**Technology [V, page source]**
- three.js **r85** (2017), tween.js, jQuery 1.12 + jQuery Mobile, legacy three.js JSON models
  per structure, custom `cerebral_fs/vs` shaders, per-structure **ambient-occlusion textures**,
  runtime mesh subdivision (`subdivide: 2`), cube-map skybox
  ([Bapp-Config.js](https://www.brainfacts.org/scripts/brainfacts2/3DBrain/components/Bapp-Config.js)).
- Model based on Allen Brain Atlas data
  ([SfN announcement](https://www.sfn.org/publications/latest-news/2017/10/30/brainfacts-relaunches-with-interactive-brain)).
- No WebGL fallback: the loader simply stops ("WebGL is not available for this device.").

**Content [V, public JSON endpoint](https://www.brainfacts.org/api/sitecore/ThreeDBrain/GetThreeDBrainComponents)**
- 59 structures: lobes, PFC, OFC, motor cortex, cerebellum, pons, medulla, midbrain, corpus
  callosum, basal ganglia incl. **nucleus accumbens**, amygdala, hippocampus, thalamus,
  hypothalamus, ventricles, cranial nerves. **No VTA.**
- 50–100-word HTML descriptions with "learn more" links; some cite PubMed.
- Contains at least one content error (labels CN II as "olfactory").

**Interaction [V, config]**
- An 8-step intro tour; tap/click to identify; search dropdown; per-structure **camera
  presets** tweened over 1 s (cubic in-out); hover glow + **animated leader lines** to the
  label; isolation slider that keeps the parent group visible; non-focused structures fade to
  **opacity 0.15**; "explode" animation; user annotations; snapshot with attribution.
- Auto-rotates on load [V, [Science News](https://www.sciencenews.org/article/website-invites-you-probe-3-d-human-brain)].
- Mobile: below 760 px it drops to low-res textures, no AO, collapsible panel [V].

**Verdict**
- *Impressive:* expert-written content, per-structure camera presets, leader-line labels,
  "fade the rest" focus.
- *Adopt:* data-driven per-structure config (camera, text, references); ~0.15 fade for
  context; snapshot.
- *Weak / dated:* 2017 three.js + jQuery Mobile; blocking modal tour; no fallback; no circuits.
- *Do not copy:* the architecture and the modal onboarding.

## 2. BioDigital Human

<https://human.biodigital.com> · <https://www.biodigital.com>

- **Access [V]:** free Personal plan narrowed on 1 May 2026 to Anatomy & Physiology content and
  5 saved models; no individual trials (support-article snippets; direct fetch 403). Whether
  brain content is free: unknown.
- **Scale [V, [product page](https://www.biodigital.com/product/the-biodigital-human)]:** "over
  14,000 individual anatomical structures", 1,000+ models, quizzes, quiz builder, tours, LMS
  embedding, AR/VR apps.
- **Tech [V]:** WebGL; the current web app is Angular; the main bundle references Draco, glTF,
  KTX2/Basis and WebGL2 (string search of `main.<hash>.js`), suggesting compressed glTF with GPU
  textures [I].
- **Interaction vocabulary [V, bundle strings]:** `isolateObject`, `enableXray`,
  `enableHighlight`, `colorObject`, `capture`, `camera.orbit/pan/zoom/reset`,
  `enableChapterCamera`, labels and annotations that fade by view angle. Tools were consolidated
  into **Select / Hide / Fade** in 2019 [V, support snippet].

**Verdict**
- *Impressive:* breadth; chapter-based guided tours with a camera per chapter; clean embed API.
- *Adopt:* the Select / Hide / Fade / X-ray vocabulary; chapter cameras; angle-fading labels.
- *Weak:* paywalled and shrinking free tier; whole-body generalist; 4.2 MB app bundle [V].
- *Do not copy:* account walls and save caps.

## 3. Visible Body (Visible Body Suite)

<https://www.visiblebody.com>, paid / institutional.

- Brain-related views include Brain, Limbic System, Thalamus, Cerebellum, Diencephalon [V,
  Cengage content lists]. Quizzes, flashcards, tours, LMS courseware [V].
- **Requirements [V, [Cengage sysreq](https://help.cengage.com/visible-body/student/visible-body/vb-suite-sysreq.html)]:**
  web needs 4 GB RAM, dedicated GPU recommended, **30 Mbps recommended**; iOS app 1.9–5.3 GB.

**Verdict:** strong curriculum integration; heavy, closed, paid. Our opening: instant,
lightweight, free.

## 4. Zygote Body

<https://www.zygotebody.com>, **unreachable during research**.

- Began as Google Body (2010), relaunched 2012; WebGL, no plug-ins; layers can be hidden or made
  transparent; core released as open-source *open-3d-viewer*
  [V, [Wikipedia](https://en.wikipedia.org/wiki/ZygoteBody),
  [Google Open Source blog](https://opensource.googleblog.com/2012/01/google-body-becomes-zygote-body-built.html)].
- *Adopt:* the **depth/layer slider**, which maps naturally onto "cortex → deep structures".
- *Dated [I]:* 2010-era UI, thin educational text.

## 5. Anatomy Learning

<https://www.anatomylearning.com>

- Web version requires **WebGL 2 and 4–6 GB RAM** [V]; 6,000+ labelled points, 500+ quizzes,
  cross-sections, **TA98 terminology** [V]. No brain-specific material described.
- *Adopt:* TA98-aligned names. *Weak:* heavy; whole-body.

## 6. Z-Anatomy (open source)

<https://www.z-anatomy.com>

- Web app is a **Unity WebGL** build with a loading bar; forces devicePixelRatio = 1 on mobile
  [V, page source].
- **CC BY-SA 4.0**, based on BodyParts3D; Blender and Unity repos public
  [V, [GitHub](https://github.com/LluisV/Z-Anatomy)]. 5,000+ structures, 3,500+ definitions [V].
- *Impressive:* genuinely reusable open meshes. *Weak [I]:* heavy WASM download, canvas-only UI
  (poor accessibility, not indexable).

## 7. Others

- **Complete Anatomy, Brain (Elsevier/3D4Medical)**: select for name/location/description;
  togglable gyri "brain map"; **45 cross-sections** in picture-in-picture or split view
  [V, [Elsevier faculty hub](https://facultyhub.elsevier.com/en/?p=1528)]. Paid. The linked
  2D-slice + 3D idea is strong.
- **G2C 3-D Brain (CSHL DNA Learning Center)**: ~30 structures, each with function, disorders,
  **case studies** and research links
  [V, [DNALC](https://dnalc.cshl.edu/view/2022-G2C-3-D-Brain.html)]; legacy tech [I].
- **Allen Brain Explorer**: a research tool; browser beta is mouse-only
  [V, [user guide](https://community.brain-map.org/t/allen-brain-explorer-beta-user-guide/3020)].
- **Sketchfab brain models**: viewer-only experiences; relevant as asset sources (see
  [04](04-3d-model-strategy.md)), not as products.

## 8. Reference images supplied by the user

The user shared three screenshots: two Blender renders of the Free3D model (grey, wireframe and
solid) and one product-style viewer showing a pink brain on a soft blue-grey gradient with a
floor shadow, a right-hand icon toolbar and a thumbnail strip of variants (including a
lobe-coloured variant). The source of the third image was not stated. What it shows that we
want: a soft, light, studio-like presentation with a grounding shadow, minimal chrome and
quick variant switching. What we would avoid: the brain occupying under a third of the frame,
and unlabeled icon-only controls.

## 9. Key takeaways

1. The only free, brain-focused, reasonably deep competitor (BrainFacts) runs on a 2017 stack,
   has no fallback, and has no reward-circuit or VTA content. That is our gap.
2. The best interaction ideas are already proven: per-structure camera presets, fade-the-rest
   focus, leader-line labels, Select / Hide / Fade vocabulary, layer slider.
3. Everyone heavy (Visible Body, Anatomy Learning, Z-Anatomy Unity) pays in load time and
   device requirements. A ≤ 3 MB, instantly interactive web model is a real differentiator.
4. Paywalls (BioDigital, Visible Body, Complete Anatomy) leave room for a free, open, cited
   resource.
