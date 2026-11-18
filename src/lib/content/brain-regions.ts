/**
 * NeuroLab region content.
 *
 * Every reference below was resolved through the Crossref API (DOI) and NCBI E-utilities (PMID)
 * on 2026-11-19 before it was added. Keep it that way: never add a reference you have not
 * resolved (see `.claude/rules/scientific-integrity.md`).
 *
 * Positions are for the stylised 3D explorer only. They are approximate and schematic: x is
 * left (-) to right (+), y is down (-) to up (+), z is back (-) to front (+), in units of the
 * stylised brain whose hemispheres span roughly ±1.4 on x, ±1.0 on y and ±1.6 on z.
 */

export interface Reference {
  /** Author list as printed, "Surname A, Surname B". */
  authors: string;
  year: number;
  title: string;
  journal: string;
  volume: string;
  pages: string;
  doi: string;
  pmid?: string;
}

export interface BrainRegion {
  slug: string;
  name: string;
  abbreviation: string;
  /** Where it is and what it is made of. */
  anatomy: string;
  primaryFunctions: readonly string[];
  /** Its role in reward and learning. */
  rewardAndLearning: string;
  /** What addiction research has reported about it, worded as findings, not causes. */
  addictionResearch: string;
  references: readonly Reference[];
  explorer: {
    position: readonly [number, number, number];
    /** Hex colour of the glowing mesh. */
    color: string;
    /** Approximate radius of the mesh. */
    radius: number;
  };
}

const KOOB_VOLKOW_2010: Reference = {
  authors: "Koob GF, Volkow ND",
  year: 2010,
  title: "Neurocircuitry of addiction",
  journal: "Neuropsychopharmacology",
  volume: "35",
  pages: "217–238",
  doi: "10.1038/npp.2009.110",
  pmid: "19710631",
};

const KOOB_VOLKOW_2016: Reference = {
  authors: "Koob GF, Volkow ND",
  year: 2016,
  title: "Neurobiology of addiction: a neurocircuitry analysis",
  journal: "The Lancet Psychiatry",
  volume: "3",
  pages: "760–773",
  doi: "10.1016/S2215-0366(16)00104-8",
  pmid: "27475769",
};

const EVERITT_ROBBINS_2005: Reference = {
  authors: "Everitt BJ, Robbins TW",
  year: 2005,
  title: "Neural systems of reinforcement for drug addiction: from actions to habits to compulsion",
  journal: "Nature Neuroscience",
  volume: "8",
  pages: "1481–1489",
  doi: "10.1038/nn1579",
  pmid: "16251991",
};

const HYMAN_MALENKA_NESTLER_2006: Reference = {
  authors: "Hyman SE, Malenka RC, Nestler EJ",
  year: 2006,
  title: "Neural mechanisms of addiction: the role of reward-related learning and memory",
  journal: "Annual Review of Neuroscience",
  volume: "29",
  pages: "565–598",
  doi: "10.1146/annurev.neuro.29.051605.113009",
  pmid: "16776597",
};

const SCHULTZ_1998: Reference = {
  authors: "Schultz W",
  year: 1998,
  title: "Predictive reward signal of dopamine neurons",
  journal: "Journal of Neurophysiology",
  volume: "80",
  pages: "1–27",
  doi: "10.1152/jn.1998.80.1.1",
  pmid: "9658025",
};

const SCHULTZ_DAYAN_MONTAGUE_1997: Reference = {
  authors: "Schultz W, Dayan P, Montague PR",
  year: 1997,
  title: "A neural substrate of prediction and reward",
  journal: "Science",
  volume: "275",
  pages: "1593–1599",
  doi: "10.1126/science.275.5306.1593",
  pmid: "9054347",
};

export const BRAIN_REGIONS: readonly BrainRegion[] = [
  {
    slug: "prefrontal-cortex",
    name: "Prefrontal cortex",
    abbreviation: "PFC",
    anatomy:
      "The cortex at the front of the frontal lobes. It includes dorsolateral, ventromedial, orbitofrontal and anterior cingulate subdivisions, and is reciprocally connected with the striatum, amygdala, hippocampus and midbrain dopamine nuclei.",
    primaryFunctions: [
      "Executive control: planning, working memory and flexible switching between strategies",
      "Inhibitory control over prepotent or habitual responses",
      "Representing the expected value of outcomes and updating it when outcomes change (orbitofrontal and ventromedial regions)",
      "Monitoring conflict and errors (anterior cingulate cortex)",
    ],
    rewardAndLearning:
      "Prefrontal regions receive dopaminergic input from the ventral tegmental area and send glutamatergic projections to the nucleus accumbens and dorsal striatum. Orbitofrontal and ventromedial areas are involved in representing what an outcome is currently worth, which lets behaviour change when the value of a reward changes.",
    addictionResearch:
      "Neuroimaging studies in people with substance use disorders have reported altered prefrontal activity and structure, including differences in regions linked to inhibitory control, salience attribution and decision-making. Reviews describe these findings as associations; whether such differences precede, follow or interact with drug use is studied in longitudinal and animal work. In the neurocircuitry framework of Koob and Volkow, prefrontal regions are prominent in the preoccupation/anticipation stage of the addiction cycle.",
    references: [
      {
        authors: "Goldstein RZ, Volkow ND",
        year: 2011,
        title:
          "Dysfunction of the prefrontal cortex in addiction: neuroimaging findings and clinical implications",
        journal: "Nature Reviews Neuroscience",
        volume: "12",
        pages: "652–669",
        doi: "10.1038/nrn3119",
        pmid: "22011681",
      },
      KOOB_VOLKOW_2010,
      KOOB_VOLKOW_2016,
    ],
    explorer: { position: [0, 0.35, 1.25], color: "#38bdf8", radius: 0.32 },
  },
  {
    slug: "amygdala",
    name: "Amygdala",
    abbreviation: "AMY",
    anatomy:
      "An almond-shaped group of nuclei in the medial temporal lobe of each hemisphere, just in front of the hippocampus. Its main divisions are the basolateral complex, which is cortex-like, and the central and medial nuclei, which are striatum-like.",
    primaryFunctions: [
      "Learning that a cue predicts an aversive or rewarding outcome (Pavlovian conditioning)",
      "Assigning emotional significance to sensory events",
      "Driving defensive and appetitive responses through outputs from the central nucleus",
    ],
    rewardAndLearning:
      "The basolateral amygdala links cues with the specific value of the outcomes they predict and passes this information to the nucleus accumbens and prefrontal cortex. Its circuits support both appetitive and aversive learning, with distinct populations of neurons associated with each.",
    addictionResearch:
      "Animal studies have implicated the basolateral amygdala in the ability of drug-associated cues to maintain and reinstate drug seeking. The extended amygdala, including the central nucleus, is prominent in accounts of the negative emotional state reported during withdrawal (the withdrawal/negative affect stage in the Koob and Volkow framework).",
    references: [
      {
        authors: "Janak PH, Tye KM",
        year: 2015,
        title: "From circuits to behaviour in the amygdala",
        journal: "Nature",
        volume: "517",
        pages: "284–292",
        doi: "10.1038/nature14188",
        pmid: "25592533",
      },
      EVERITT_ROBBINS_2005,
      KOOB_VOLKOW_2010,
    ],
    explorer: { position: [0.62, -0.42, 0.35], color: "#f97316", radius: 0.15 },
  },
  {
    slug: "nucleus-accumbens",
    name: "Nucleus accumbens",
    abbreviation: "NAc",
    anatomy:
      "The main part of the ventral striatum, where the caudate and putamen meet beneath the septum. It is divided into a core and a shell. Most of its neurons are GABAergic medium spiny neurons, and it receives dopaminergic input from the ventral tegmental area and glutamatergic input from the prefrontal cortex, amygdala and hippocampus.",
    primaryFunctions: [
      "Integrating motivational, emotional and contextual information to influence action",
      "Invigorating effortful behaviour towards rewards",
      "Pavlovian-to-instrumental transfer: letting reward-predicting cues energise ongoing behaviour",
    ],
    rewardAndLearning:
      "The nucleus accumbens is often described as an interface between motivation and action. Dopamine release in the accumbens is associated with reward prediction and incentive salience, and its outputs reach the ventral pallidum and, from there, motor and thalamic circuits.",
    addictionResearch:
      "Drugs of abuse share the property of increasing dopamine in the nucleus accumbens, and this region is central to the binge/intoxication stage in neurocircuitry models. Research in animals has reported drug-induced synaptic and molecular changes in accumbens neurons that are studied as candidate substrates of persistent drug seeking.",
    references: [
      {
        authors: "Floresco SB",
        year: 2015,
        title: "The nucleus accumbens: an interface between cognition, emotion, and action",
        journal: "Annual Review of Psychology",
        volume: "66",
        pages: "25–52",
        doi: "10.1146/annurev-psych-010213-115159",
        pmid: "25251489",
      },
      {
        authors: "Haber SN, Knutson B",
        year: 2010,
        title: "The reward circuit: linking primate anatomy and human imaging",
        journal: "Neuropsychopharmacology",
        volume: "35",
        pages: "4–26",
        doi: "10.1038/npp.2009.129",
        pmid: "19812543",
      },
      HYMAN_MALENKA_NESTLER_2006,
    ],
    explorer: { position: [0.22, -0.2, 0.62], color: "#ec4899", radius: 0.14 },
  },
  {
    slug: "basal-ganglia",
    name: "Basal ganglia (dorsal striatum)",
    abbreviation: "DS",
    anatomy:
      "The basal ganglia are subcortical nuclei comprising the striatum, globus pallidus, subthalamic nucleus and substantia nigra. This page focuses on the dorsal striatum: the caudate nucleus and putamen, which receive dense dopaminergic input from the substantia nigra pars compacta and cortical input from across the frontal lobe.",
    primaryFunctions: [
      "Selecting and initiating actions",
      "Goal-directed learning, associated with the dorsomedial striatum (caudate in primates)",
      "Habit formation, associated with the dorsolateral striatum (putamen in primates)",
    ],
    rewardAndLearning:
      "Cortico-basal ganglia loops support learning which actions lead to reward. With extended training, control of behaviour in animal experiments can shift from goal-directed actions, which are sensitive to changes in outcome value, to habits, which are not; this shift is associated with a move from dorsomedial to dorsolateral striatal circuits.",
    addictionResearch:
      "Everitt and Robbins proposed that, with repeated drug use, control over drug seeking shifts from ventral to dorsal striatal circuits, from actions to habits and eventually to compulsive behaviour. This is a theoretical framework supported mainly by animal studies; how far it accounts for human addiction remains an active research question.",
    references: [
      EVERITT_ROBBINS_2005,
      {
        authors: "Yin HH, Knowlton BJ",
        year: 2006,
        title: "The role of the basal ganglia in habit formation",
        journal: "Nature Reviews Neuroscience",
        volume: "7",
        pages: "464–476",
        doi: "10.1038/nrn1919",
        pmid: "16715055",
      },
      {
        authors: "Graybiel AM",
        year: 2008,
        title: "Habits, rituals, and the evaluative brain",
        journal: "Annual Review of Neuroscience",
        volume: "31",
        pages: "359–387",
        doi: "10.1146/annurev.neuro.29.051605.112851",
        pmid: "18558860",
      },
    ],
    explorer: { position: [0.42, 0.18, 0.25], color: "#a3e635", radius: 0.22 },
  },
  {
    slug: "hippocampus",
    name: "Hippocampus",
    abbreviation: "HPC",
    anatomy:
      "A curved structure in the medial temporal lobe of each hemisphere, behind the amygdala. It comprises the dentate gyrus and the CA fields, and connects with the neocortex through the entorhinal cortex.",
    primaryFunctions: [
      "Forming new declarative (episodic and semantic) memories",
      "Spatial and contextual memory",
      "Linking the elements of an experience into a single memory",
    ],
    rewardAndLearning:
      "The ventral hippocampus projects to the nucleus accumbens and conveys contextual information, so that the place or situation in which a reward was obtained can influence motivated behaviour.",
    addictionResearch:
      "Addiction has been described as, in part, a disorder of reward-related learning and memory. Animal studies have reported that drug-paired contexts can trigger drug seeking, and the hippocampus is studied for its role in these context associations. In the Koob and Volkow framework it is one of the regions linked to the preoccupation/anticipation stage.",
    references: [
      {
        authors: "Squire LR",
        year: 1992,
        title:
          "Memory and the hippocampus: a synthesis from findings with rats, monkeys, and humans",
        journal: "Psychological Review",
        volume: "99",
        pages: "195–231",
        doi: "10.1037/0033-295X.99.2.195",
        pmid: "1594723",
      },
      HYMAN_MALENKA_NESTLER_2006,
      KOOB_VOLKOW_2010,
    ],
    explorer: { position: [0.66, -0.38, -0.25], color: "#facc15", radius: 0.16 },
  },
  {
    slug: "ventral-tegmental-area",
    name: "Ventral tegmental area",
    abbreviation: "VTA",
    anatomy:
      "A group of neurons on the floor of the midbrain, next to the substantia nigra. It contains dopaminergic, GABAergic and glutamatergic neurons. Its dopamine neurons project to the nucleus accumbens (the mesolimbic pathway) and to the prefrontal cortex (the mesocortical pathway).",
    primaryFunctions: [
      "Supplying dopamine to the nucleus accumbens, prefrontal cortex, amygdala and hippocampus",
      "Signalling reward-related information to its targets",
      "Contributing to motivation and reinforcement",
    ],
    rewardAndLearning:
      "In recordings from monkeys, many midbrain dopamine neurons fire to an unexpected reward; after learning they fire to the cue that predicts the reward instead, and their activity dips when a predicted reward is omitted. This pattern closely resembles the prediction error of temporal-difference learning models, which is the link explored in the NeuroLab simulator. The VTA is also heterogeneous, and not all of its neurons follow this pattern.",
    addictionResearch:
      "Addictive drugs increase dopamine transmission in VTA targets, by different mechanisms. Reviews describe drug-induced adaptations in VTA neurons and their inputs and discuss how drugs could interact with prediction-error signalling. These are findings from research models and are not measurements that NeuroLab makes or simulates.",
    references: [
      SCHULTZ_1998,
      SCHULTZ_DAYAN_MONTAGUE_1997,
      {
        authors: "Morales M, Margolis EB",
        year: 2017,
        title: "Ventral tegmental area: cellular heterogeneity, connectivity and behaviour",
        journal: "Nature Reviews Neuroscience",
        volume: "18",
        pages: "73–85",
        doi: "10.1038/nrn.2016.165",
        pmid: "28053327",
      },
    ],
    explorer: { position: [0, -0.62, -0.12], color: "#a78bfa", radius: 0.13 },
  },
];

export function getBrainRegion(slug: string): BrainRegion | undefined {
  return BRAIN_REGIONS.find((region) => region.slug === slug);
}

export function doiUrl(doi: string): string {
  return `https://doi.org/${doi}`;
}

export function pubmedUrl(pmid: string): string {
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
}

/** "Koob GF, Volkow ND (2010). Neurocircuitry of addiction. Neuropsychopharmacology 35, 217–238." */
export function formatReference(ref: Reference): string {
  return `${ref.authors} (${ref.year}). ${ref.title}. ${ref.journal} ${ref.volume}, ${ref.pages}.`;
}
