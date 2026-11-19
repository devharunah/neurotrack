import type { Evidence } from "./types";

export interface EvidenceInfo {
  label: string;
  description: string;
}

/**
 * How each evidence label is explained in the UI. These describe the *type* of evidence a record
 * reports, read from its publication-type metadata. They are not a quality grade.
 */
export const EVIDENCE_INFO: Record<Evidence, EvidenceInfo> = {
  "systematic-review/meta-analysis": {
    label: "Systematic review / meta-analysis",
    description:
      "Collects and appraises many studies on one question with a stated method, sometimes pooling their results.",
  },
  "randomized-trial": {
    label: "Randomized trial",
    description: "Assigns participants to conditions at random and compares outcomes.",
  },
  review: {
    label: "Review",
    description: "Summarises earlier work, usually without a systematic search or pooled analysis.",
  },
  "primary-study": {
    label: "Primary study",
    description:
      "Reports its own data: an experiment, cohort, case report, observational study or preprint.",
  },
  other: {
    label: "Other",
    description:
      "Commentary, editorial, letter, or a record whose publication type was not reported.",
  },
};

export const EVIDENCE_NOT_QUALITY =
  "Evidence labels describe the type of evidence a publication reports, taken from its publication-type metadata. They are not a quality grade: a weak meta-analysis is still a meta-analysis, and an excellent cohort study is still a primary study.";
