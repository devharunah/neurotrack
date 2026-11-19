/** Row shapes read from the BehaviourLab tables (see the migration). Pseudonymous only. */
import type { Environment, SocialContext, StudyStatus } from "./schemas";

export interface StudyRecord {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  synthetic: boolean;
  ethics_approval_ref: string | null;
  join_code: string;
  questionnaire: unknown;
  schedule: unknown;
  status: StudyStatus;
  created_at: string;
  updated_at: string;
}

export interface ParticipantRecord {
  id: string;
  pseudonym: string;
  synthetic: boolean;
  created_at: string;
}

export interface ConsentRecord {
  participant_id: string;
  consent_version: string;
  given_at: string;
  withdrawn_at: string | null;
}

export interface ObservationRecord {
  id: string;
  participant_id: string;
  observed_at: string;
  mood: number | null;
  stress: number | null;
  sleep_quality: number | null;
  craving_intensity: number | null;
  environment: Environment | null;
  social_context: SocialContext | null;
  substance_use: boolean | null;
  answers: Record<string, unknown>;
}

export const OBSERVATION_COLUMNS =
  "id, participant_id, observed_at, mood, stress, sleep_quality, craving_intensity, environment, social_context, substance_use, answers";
