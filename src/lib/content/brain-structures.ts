/**
 * Anatomy content for the 3D brain explorer: the lobes and major structures shown in
 * "Structures" mode, plus the thalamus and hypothalamus shown with the deep structures.
 * The reward-circuit regions live in `brain-regions.ts`.
 *
 * Every reference below was resolved with `tools/resolve_reference.py` (Crossref + NCBI
 * E-utilities) on 2026-11-20 and copied from its output. Keep it that way: never add a
 * reference you have not resolved (see `.claude/rules/scientific-integrity.md`).
 *
 * Text is general anatomy at the level of an introductory neuroscience course. Functions are
 * described as what a region is involved in, not as a complete or exclusive account.
 */
import { z } from "zod";

import type { Reference } from "./brain-regions";

export interface BrainStructure {
  slug: string;
  name: string;
  /** Short category line shown above the name, e.g. "Cerebral cortex · lobe". */
  category: string;
  /** Where it is, in plain language. */
  location: string;
  primaryFunctions: readonly string[];
  /** Processes it takes part in, with the parts of the structure involved. */
  associatedProcesses: string;
  /** Only where a resolved study supports it; worded as findings, not causes. */
  addictionResearch?: string;
  /** Slugs of related structures or reward-circuit regions. */
  related: readonly string[];
  references: readonly Reference[];
  explorer: {
    color: string;
    /** Model parts (both hemispheres) that make up the structure in the 3D explorer. */
    parts: readonly string[];
    /** Which explorer mode lists the structure. */
    mode: "structures" | "deep";
  };
}

const referenceSchema = z.object({
  authors: z.string().min(2),
  year: z.number().int().min(1900).max(2100),
  title: z.string().min(5),
  journal: z.string().min(2),
  volume: z.string().min(1),
  pages: z.string().min(1),
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/),
  pmid: z
    .string()
    .regex(/^\d{5,9}$/)
    .optional(),
});

export const brainStructureSchema = z.object({
  slug: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
  name: z.string().min(3),
  category: z.string().min(3),
  location: z.string().min(40),
  primaryFunctions: z.array(z.string().min(10)).min(2).max(6),
  associatedProcesses: z.string().min(40),
  addictionResearch: z.string().min(40).optional(),
  related: z.array(z.string()),
  references: z.array(referenceSchema).min(1),
  explorer: z.object({
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    parts: z.array(z.string()).min(1),
    mode: z.enum(["structures", "deep"]),
  }),
});

const MILLER_COHEN_2001: Reference = {
  authors: "Miller EK, Cohen JD",
  year: 2001,
  title: "An integrative theory of prefrontal cortex function",
  journal: "Annual Review of Neuroscience",
  volume: "24",
  pages: "167–202",
  doi: "10.1146/annurev.neuro.24.1.167",
  pmid: "11283309",
};

const CULHAM_KANWISHER_2001: Reference = {
  authors: "Culham JC, Kanwisher NG",
  year: 2001,
  title: "Neuroimaging of cognitive functions in human parietal cortex",
  journal: "Current Opinion in Neurobiology",
  volume: "11",
  pages: "157–163",
  doi: "10.1016/S0959-4388(00)00191-4",
  pmid: "11301234",
};

const HICKOK_POEPPEL_2007: Reference = {
  authors: "Hickok G, Poeppel D",
  year: 2007,
  title: "The cortical organization of speech processing",
  journal: "Nature Reviews Neuroscience",
  volume: "8",
  pages: "393–402",
  doi: "10.1038/nrn2113",
  pmid: "17431404",
};

const GRILL_SPECTOR_MALACH_2004: Reference = {
  authors: "Grill-Spector K, Malach R",
  year: 2004,
  title: "The human visual cortex",
  journal: "Annual Review of Neuroscience",
  volume: "27",
  pages: "649–677",
  doi: "10.1146/annurev.neuro.27.070203.144220",
  pmid: "15217346",
};

const SQUIRE_1992: Reference = {
  authors: "Squire LR",
  year: 1992,
  title: "Memory and the hippocampus: a synthesis from findings with rats, monkeys, and humans",
  journal: "Psychological Review",
  volume: "99",
  pages: "195–231",
  doi: "10.1037/0033-295X.99.2.195",
  pmid: "1594723",
};

const CRAIG_2009: Reference = {
  authors: "Craig AD",
  year: 2009,
  title: "How do you feel — now? The anterior insula and human awareness",
  journal: "Nature Reviews Neuroscience",
  volume: "10",
  pages: "59–70",
  doi: "10.1038/nrn2555",
  pmid: "19096369",
};

const NAQVI_2007: Reference = {
  authors: "Naqvi NH, Rudrauf D, Damasio H, Bechara A",
  year: 2007,
  title: "Damage to the insula disrupts addiction to cigarette smoking",
  journal: "Science",
  volume: "315",
  pages: "531–534",
  doi: "10.1126/science.1135926",
  pmid: "17255515",
};

const BUSH_LUU_POSNER_2000: Reference = {
  authors: "Bush G, Luu P, Posner MI",
  year: 2000,
  title: "Cognitive and emotional influences in anterior cingulate cortex",
  journal: "Trends in Cognitive Sciences",
  volume: "4",
  pages: "215–222",
  doi: "10.1016/S1364-6613(00)01483-2",
  pmid: "10827444",
};

const LEECH_SHARP_2014: Reference = {
  authors: "Leech R, Sharp DJ",
  year: 2014,
  title: "The role of the posterior cingulate cortex in cognition and disease",
  journal: "Brain",
  volume: "137",
  pages: "12–32",
  doi: "10.1093/brain/awt162",
  pmid: "23869106",
};

const BUCKNER_2013: Reference = {
  authors: "Buckner RL",
  year: 2013,
  title: "The cerebellum and cognitive function: 25 years of insight from anatomy and neuroimaging",
  journal: "Neuron",
  volume: "80",
  pages: "807–815",
  doi: "10.1016/j.neuron.2013.10.044",
  pmid: "24183029",
};

const FERNANDEZ_GIL_2010: Reference = {
  authors: "Ángeles Fernández-Gil M, Palacios-Bote R, Leo-Barahona M, Mora-Encinas J",
  year: 2010,
  title: "Anatomy of the brainstem: a gaze into the stem of life",
  journal: "Seminars in Ultrasound, CT and MRI",
  volume: "31",
  pages: "196–219",
  doi: "10.1053/j.sult.2010.03.006",
  pmid: "20483389",
};

const GAZZANIGA_2000: Reference = {
  authors: "Gazzaniga MS",
  year: 2000,
  title:
    "Cerebral specialization and interhemispheric communication: does the corpus callosum enable the human condition?",
  journal: "Brain",
  volume: "123",
  pages: "1293–1326",
  doi: "10.1093/brain/123.7.1293",
  pmid: "10869045",
};

const SHERMAN_2016: Reference = {
  authors: "Sherman SM",
  year: 2016,
  title: "Thalamus plays a central role in ongoing cortical functioning",
  journal: "Nature Neuroscience",
  volume: "19",
  pages: "533–541",
  doi: "10.1038/nn.4269",
  pmid: "27021938",
};

const SAPER_LOWELL_2014: Reference = {
  authors: "Saper CB, Lowell BB",
  year: 2014,
  title: "The hypothalamus",
  journal: "Current Biology",
  volume: "24",
  pages: "R1111–R1116",
  doi: "10.1016/j.cub.2014.10.023",
  pmid: "25465326",
};

export const BRAIN_STRUCTURES: readonly BrainStructure[] = [
  {
    slug: "frontal-lobe",
    name: "Frontal lobe",
    category: "Cerebral cortex · lobe",
    location:
      "The front of each cerebral hemisphere, in front of the central sulcus and above the lateral (Sylvian) fissure. Its rearmost strip, the precentral gyrus, borders the parietal lobe.",
    primaryFunctions: [
      "Planning and controlling voluntary movement (primary motor cortex in the precentral gyrus, with premotor areas in front of it)",
      "Executive control: holding goals in mind, planning, and switching or inhibiting behaviour (prefrontal cortex)",
      "Producing speech, with inferior frontal regions taking part in articulation and speech planning, usually more on the left",
    ],
    associatedProcesses:
      "Working memory, sustained attention, decision-making and the regulation of social and emotional behaviour all involve prefrontal regions, which are richly connected with almost every other part of the cortex and with subcortical structures.",
    related: ["parietal-lobe", "insula", "limbic-lobe", "prefrontal-cortex"],
    references: [MILLER_COHEN_2001, HICKOK_POEPPEL_2007],
    explorer: { color: "#5b9bd5", parts: ["prefrontal", "motor_frontal"], mode: "structures" },
  },
  {
    slug: "parietal-lobe",
    name: "Parietal lobe",
    category: "Cerebral cortex · lobe",
    location:
      "Behind the frontal lobe, from the central sulcus back to the parieto-occipital sulcus, and above the temporal lobe. On the inner (medial) surface it includes the precuneus.",
    primaryFunctions: [
      "Body sensation: touch, pressure, temperature and limb position (primary somatosensory cortex in the postcentral gyrus)",
      "Representing space and directing attention within it",
      "Using sensory information to guide actions such as reaching, grasping and eye movements",
    ],
    associatedProcesses:
      "Neuroimaging links regions of the parietal cortex with spatial attention, eye movements, reaching and grasping, mental rotation and the processing of numbers.",
    related: ["frontal-lobe", "occipital-lobe", "temporal-lobe"],
    references: [CULHAM_KANWISHER_2001],
    explorer: { color: "#e0b04f", parts: ["parietal"], mode: "structures" },
  },
  {
    slug: "temporal-lobe",
    name: "Temporal lobe",
    category: "Cerebral cortex · lobe",
    location:
      "The lower side of each hemisphere, below the lateral fissure. It runs from the temporal pole at the front back towards the occipital lobe, and its inner part borders the hippocampus and amygdala.",
    primaryFunctions: [
      "Hearing: the primary auditory cortex lies on the transverse temporal (Heschl's) gyrus",
      "Understanding speech, which relies on superior temporal regions in both hemispheres",
      "Recognising objects and faces along its lower (ventral) surface",
    ],
    associatedProcesses:
      "Its medial part, together with the hippocampus and nearby cortex, forms the medial temporal lobe memory system, which is needed to form new long-term memories of facts and events.",
    related: ["hippocampus", "amygdala", "occipital-lobe", "insula"],
    references: [HICKOK_POEPPEL_2007, GRILL_SPECTOR_MALACH_2004, SQUIRE_1992],
    explorer: { color: "#5fbf8f", parts: ["temporal"], mode: "structures" },
  },
  {
    slug: "occipital-lobe",
    name: "Occipital lobe",
    category: "Cerebral cortex · lobe",
    location:
      "The back of each hemisphere, behind the parieto-occipital sulcus. The primary visual cortex lines the calcarine sulcus on its inner (medial) surface.",
    primaryFunctions: [
      "Receiving visual input relayed from the eyes through the thalamus (primary visual cortex)",
      "Early analysis of edges, orientation, colour and motion",
      "Passing visual information forward to pathways for recognising objects and for locating and acting on them",
    ],
    associatedProcesses:
      "Visual areas are organised as maps of the visual field. From the occipital lobe, a ventral stream runs into the temporal lobe (what an object is) and a dorsal stream runs into the parietal lobe (where it is and how to act on it).",
    related: ["parietal-lobe", "temporal-lobe", "thalamus"],
    references: [GRILL_SPECTOR_MALACH_2004],
    explorer: { color: "#d07aa8", parts: ["occipital"], mode: "structures" },
  },
  {
    slug: "insula",
    name: "Insula",
    category: "Cerebral cortex",
    location:
      "A region of cortex folded deep inside the lateral fissure, hidden from the surface by overlapping parts of the frontal, parietal and temporal lobes.",
    primaryFunctions: [
      "Interoception: representing the internal state of the body, such as heartbeat, breathing and visceral sensation",
      "Taste (primary gustatory cortex)",
      "Contributing to emotional awareness and to noticing what is currently important",
    ],
    associatedProcesses:
      "Craig proposed that the anterior insula integrates bodily signals into a moment-to-moment representation of how one feels, which supports subjective awareness of emotions and the body.",
    addictionResearch:
      "In a study of smokers who had brain lesions, damage that involved the insula was associated with a disruption of smoking addiction: compared with smokers whose damage spared the insula, they were more likely to have quit easily and immediately, without relapse and without a persisting urge to smoke. This is an association from a lesion study, and it prompted further research on the insula and craving.",
    related: ["frontal-lobe", "temporal-lobe", "limbic-lobe", "prefrontal-cortex"],
    references: [CRAIG_2009, NAQVI_2007],
    explorer: { color: "#e58b5a", parts: ["insula"], mode: "structures" },
  },
  {
    slug: "limbic-lobe",
    name: "Limbic lobe (cingulate and parahippocampal gyri)",
    category: "Cerebral cortex",
    location:
      "A ring of cortex on the inner (medial) surface of each hemisphere. The cingulate gyrus curves over the corpus callosum and continues, behind and below it, into the parahippocampal gyrus of the medial temporal lobe.",
    primaryFunctions: [
      "Monitoring conflict and errors and adjusting behaviour accordingly (anterior cingulate cortex)",
      "Regulating attention and emotional responses (anterior cingulate cortex)",
      "Internally directed thought and memory retrieval (posterior cingulate cortex)",
    ],
    associatedProcesses:
      "The posterior cingulate cortex is a core part of the brain's default mode network, which is most active during rest and self-referential thought. The parahippocampal gyrus is part of the medial temporal lobe memory system.",
    related: ["corpus-callosum", "hippocampus", "frontal-lobe", "prefrontal-cortex"],
    references: [BUSH_LUU_POSNER_2000, LEECH_SHARP_2014, SQUIRE_1992],
    explorer: {
      color: "#a68ee0",
      parts: ["anterior_cingulate", "limbic_posterior"],
      mode: "structures",
    },
  },
  {
    slug: "cerebellum",
    name: "Cerebellum",
    category: "Hindbrain",
    location:
      "Beneath the occipital lobes at the back of the skull, behind the brainstem. It has two hemispheres joined by a narrow midline part, the vermis, and connects to the brainstem through three pairs of cerebellar peduncles.",
    primaryFunctions: [
      "Coordinating the timing and precision of movements",
      "Maintaining balance and posture",
      "Motor learning: refining movements with practice",
    ],
    associatedProcesses:
      "Anatomical and neuroimaging work shows that large parts of the human cerebellum are connected with association areas of the cerebral cortex and are active during cognitive tasks, not only during movement.",
    related: ["brainstem", "occipital-lobe"],
    references: [BUCKNER_2013],
    explorer: { color: "#4fbfc4", parts: ["cerebellum"], mode: "structures" },
  },
  {
    slug: "brainstem",
    name: "Brainstem",
    category: "Brainstem",
    location:
      "The stalk that joins the cerebrum to the spinal cord, made up of the midbrain, the pons and the medulla oblongata, in front of the cerebellum. The model ends at the lower medulla; the spinal cord is not included.",
    primaryFunctions: [
      "Carrying all the sensory and motor pathways between the brain and the spinal cord",
      "Containing the nuclei of most cranial nerves (eye movements, facial sensation and movement, hearing, swallowing)",
      "Regulating vital functions such as breathing, heart rate and blood pressure (medulla)",
    ],
    associatedProcesses:
      "Networks of neurons in the brainstem (the reticular formation) contribute to arousal and sleep–wake states. The midbrain also contains the dopamine-producing neurons of the substantia nigra and the ventral tegmental area.",
    related: ["cerebellum", "ventral-tegmental-area", "thalamus"],
    references: [FERNANDEZ_GIL_2010],
    explorer: {
      color: "#c9a27a",
      parts: ["midbrain", "midbrain_tegmentum", "pons", "medulla"],
      mode: "structures",
    },
  },
  {
    slug: "corpus-callosum",
    name: "Corpus callosum",
    category: "White matter",
    location:
      "A thick, arched band of nerve fibres in the midline, at the bottom of the deep groove between the two hemispheres and beneath the cingulate gyri. It is easiest to see on the inner (medial) view.",
    primaryFunctions: [
      "Connecting the left and right cerebral hemispheres; it is the largest fibre bundle between them",
      "Transferring sensory, motor and cognitive information between the hemispheres",
    ],
    associatedProcesses:
      "Studies of people whose corpus callosum was cut to treat severe epilepsy (split-brain patients) showed that each hemisphere can process information that the other does not have access to, and revealed differences in how the hemispheres are specialised.",
    related: ["limbic-lobe", "frontal-lobe"],
    references: [GAZZANIGA_2000],
    explorer: { color: "#e6e1d3", parts: ["corpus_callosum"], mode: "structures" },
  },
  {
    slug: "thalamus",
    name: "Thalamus",
    category: "Diencephalon",
    location:
      "A paired, egg-shaped mass of nuclei at the centre of the brain, one on each side of the third ventricle, above the midbrain and beneath the cerebral hemispheres.",
    primaryFunctions: [
      "Relaying sensory information to the cortex, for every sense except smell (for example vision through the lateral geniculate nucleus, hearing through the medial geniculate nucleus)",
      "Passing information from the basal ganglia and cerebellum to motor areas of the cortex",
      "Relaying information between cortical areas through its higher-order nuclei",
    ],
    associatedProcesses:
      "Sherman argues that the thalamus is not only a relay for the senses but takes a central part in ongoing cortical function, because many cortical areas communicate with each other through thalamic nuclei.",
    related: ["hypothalamus", "brainstem", "basal-ganglia", "occipital-lobe"],
    references: [SHERMAN_2016],
    explorer: { color: "#8fb3ff", parts: ["thalamus"], mode: "deep" },
  },
  {
    slug: "hypothalamus",
    name: "Hypothalamus",
    category: "Diencephalon",
    location:
      "A small region below the thalamus that forms the floor and lower walls of the third ventricle. The pituitary gland hangs beneath it, and the mammillary bodies form its rear edge.",
    primaryFunctions: [
      "Keeping internal conditions stable (homeostasis): body temperature, hunger, thirst and energy balance",
      "Controlling hormone release from the pituitary gland",
      "Coordinating autonomic responses and daily (circadian) rhythms",
    ],
    associatedProcesses:
      "Hypothalamic circuits help organise motivated behaviours such as feeding, drinking, sex and defensive responses, linking bodily needs with behaviour.",
    related: ["thalamus", "amygdala", "brainstem"],
    references: [SAPER_LOWELL_2014],
    explorer: { color: "#ff9f80", parts: ["hypothalamus"], mode: "deep" },
  },
];

export function getBrainStructure(slug: string): BrainStructure | undefined {
  return BRAIN_STRUCTURES.find((structure) => structure.slug === slug);
}
