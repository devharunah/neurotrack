# Privacy and data

How NeuroTrack handles personal and research data: what is stored, who can read it, how long it
is kept, how consent works, and where the line between educational and clinical use is. The
user-facing summary is the `/privacy` page; table-by-table access rules are in
`supabase/tests/rls_checklist.md`. Each deployment's operator is the party responsible for the
data in it and must adapt this to their own legal obligations.

## Data inventory

| Data | Where | Personal? | Who can read it | Created by |
|---|---|---|---|---|
| Email, password hash or OAuth identity, sign-in timestamps | Supabase Auth (`auth.users`) | Yes | The user (own session); the operator | Sign-up |
| Display name, role | `profiles` | Yes (display name) | The user | Trigger on sign-up; display name editable in `/settings` |
| Saved lab runs (configs and results) | `experiments` | Linked to the account | The user | The user, in each lab |
| Literature searches and questions | `research_queries` | Linked to the account; free text | The user | Research Assistant |
| Cached publication metadata | `literature_references` | No (public bibliographic data), but per user | The user who fetched it | Research Assistant |
| Saved references and notes | `saved_references` | Linked to the account; free text | The user | Research Assistant |
| Studies (title, description, questionnaire, schedule, ethics reference, join code) | `studies`, `study_members` | Linked to researchers' accounts | Study members | Researchers |
| Participant pseudonym | `participants` | Pseudonymous | Study members; the participant while consented | `join_study`, or the synthetic seeder (`S-`) |
| Account ↔ pseudonym link | `participant_links` | **Yes: the re-identification key** | Only the participant themself | `join_study` |
| Consent records (version, SHA-256 of the text shown, given/withdrawn times) | `consents` | Pseudonymous | Study members (status); the participant | `join_study`, `withdraw_consent` |
| Check-ins: mood, stress, sleep, craving, setting, company, optional substance use, custom answers | `observations` | Pseudonymous, **sensitive** (health and substance use) | Study members; the participant while consented | Participants; seeder (synthetic) |
| Export log (who, when, how many rows) | `export_audit` | Linked to researchers | Study members | `log_study_export` only |
| Failed join-code lookups | `join_attempts` | Linked to the account | Nobody through the API | `preview_study`, `join_study` |
| Published consent texts (version + hash) | `consent_versions` | No | Any signed-in user | Migrations |
| API access logs: time, method, path, status, duration, client IP, request ID | API host's log stream | IP address | The operator | Every API request |

Not stored anywhere: request bodies in logs, access tokens in logs, analytics or advertising
identifiers. The only cookies are Supabase's session cookies.

**Data leaving the system.** Literature search text is sent to Europe PMC and NCBI PubMed through
the API, without any account identifier. BehaviourLab analyses send observation values to the
NeuroTrack API with an opaque per-request participant index (`k0`, `k1`, …), never the pseudonym
or account; the API does not store them. QuantumLab never reads behavioural data. Nothing is sent
to an LLM unless the operator configures `OLLAMA_URL`, which is meant for a local server.

## Pseudonymity and access

- Participants are random pseudonyms scoped to one study (`P-7F3K`). No table in the BehaviourLab
  schema has a name, email or phone column.
- `participant_links` is the only account-to-pseudonym mapping. It has no researcher policy, and
  no RPC returns another user's link.
- **Study members can read their study's pseudonymous observations directly through PostgREST, by
  design**: they are the researchers the participant consented to share answers with, and the
  dashboards and analyses need those rows. `export_audit` records each CSV export made through the
  app (written only by `log_study_export`, which counts the rows itself, so the count cannot be
  forged); it is not a log of every read. Treat study membership as the access decision: add
  only researchers covered by the study's approval.
- Residual risk: a researcher who knows when a specific person joined could match that time to a
  participant's `created_at`. Keep studies large enough and do not share join times.
- Exports contain pseudonyms only, are formula-injection safe, and are labelled synthetic per row
  and in the file name when the study is synthetic.

## Consent model

1. A study shares its join code. Someone with the code sees only the title, description and
   schedule (`preview_study`); failed codes are throttled per user (10 per hour) to stop guessing.
2. Before joining, they read the versioned participant information and consent text
   (`src/lib/behaviour/consent.ts`). Joining (`join_study`) stores the version and the SHA-256 of
   that exact text; the database accepts only versions published in `consent_versions`.
3. Observations are accepted only while consent is active and the study is active, at most one
   check-in per minute, with the server's timestamp.
4. A participant can withdraw at any time from the study page (`withdraw_consent`). No new
   answers are accepted after that, and they can choose to delete all the answers they gave.
5. Publishing a new consent version means adding a document in `consent.ts` **and** a migration
   that inserts its hash into `consent_versions` (a Jest test checks every version is seeded).
   Old versions are never edited, so past consents stay verifiable.

Studies start **synthetic**. A study can switch to real data only with a non-empty ethics approval
reference (a database CHECK), and synthetic and real participants can never mix. Real participant
data requires institutional and ethical approval, including applicable Ugandan requirements, before
any real person is invited.

## Retention and deletion

| What | Kept until | How to delete |
|---|---|---|
| Account and everything linked to it | The account is deleted | The operator deletes the user in Supabase Auth; every table with a `user_id`/`owner_id`/`inserted_by` column cascades (`on delete cascade` to `auth.users`), including studies the user owns |
| Saved experiments | The user deletes them | `/settings` → Delete all my experiment history |
| Research history and saved references | The user deletes them | Research Assistant: clear history; unsave a reference |
| Cached publication metadata (public bibliographic data) | The account is deleted | Append-only for clients; removed with the account |
| A participant's answers | Withdrawal with deletion, or study deletion. **Account deletion does not delete them**: it removes only `participant_links`, leaving the pseudonym, consent record and answers in the study, unlinked | Study page → Withdraw → delete my answers (before asking for account deletion) |
| Studies and all their participants, observations, consents and export logs | The owner deletes the study | Study settings → Delete |
| Synthetic participants | The researcher clears them | Study page → Clear synthetic data |
| Failed join attempts | At least 1 hour; rows older than 1 day are pruned on the user's next lookup, and all go with the account | Automatic |
| API logs | The hosting provider's log retention | Provider settings |
| Database backups | The Supabase plan's backup retention | Supabase |

Users can download their own data as JSON from `/settings` (profile, experiments, research
history, studies they belong to, participations and the check-ins they can still read). Whole-
account deletion is done by the operator on request; there is no self-service account deletion
yet, because it needs a privileged key the web app deliberately does not hold.

Operators: set a retention period for each real study in its ethics approval, and delete the study
(or export and delete) when it ends.

## Educational, not clinical

NeuroTrack is for learning and research. It:

- does **not** diagnose, screen, predict relapse or risk for an individual, or recommend
  treatment or medication changes;
- does **not** measure dopamine or brain activity; reward-learning models are abstract models;
- reports behavioural **associations** with their uncertainty, never causes, and only at group
  level;
- is not a medical device and is not monitored: it cannot respond to emergencies, and the
  participant information says so and points people to health professionals and local support.

Using NeuroTrack data for decisions about a person's care, or training models on participant data
without explicit authorisation and consent, is outside its intended use.
