import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What NeuroTrack stores, why, who can see it, and how to export or delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy notice" updated="19 November 2026">
      <p>
        NeuroTrack is an open-source, educational research platform. This notice describes what this
        deployment of NeuroTrack stores about you and why. The organisation or person who runs this
        deployment (the <em>operator</em>) is responsible for it; contact them with any privacy
        request. NeuroTrack is not a clinical service: nothing it stores is a medical record, and
        nothing it computes diagnoses you or predicts anything about you.
      </p>

      <LegalSection heading="What we store">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your account.</strong> Your email address and a password hash (or the identity
            from the sign-in provider you chose), kept by our authentication provider, Supabase
            Auth, along with sign-in timestamps.
          </li>
          <li>
            <strong>Your profile.</strong> A display name, which you can change in Settings, and a
            role (student, researcher or admin), which only the operator can change.
          </li>
          <li>
            <strong>Saved experiments.</strong> The settings and results of lab runs you choose to
            save in QuantumLab, NeuroLab and the other labs.
          </li>
          <li>
            <strong>Research Assistant history.</strong> The searches and questions you run,
            publication records (titles, abstracts and authors as published) retrieved for you, and
            the references and notes you save. These are private to you.
          </li>
          <li>
            <strong>BehaviourLab, as a participant.</strong> When you join a study you get a random
            pseudonym (such as <code>P-7F3K</code>). We store a record of your consent (the version
            and a fingerprint of the exact text you agreed to) and the check-in answers you submit.
            The link between your account and your pseudonym is stored separately, and researchers
            cannot read it.
          </li>
          <li>
            <strong>BehaviourLab, as a researcher.</strong> The studies you create, their settings,
            and a log of every export you make.
          </li>
          <li>
            <strong>Server logs.</strong> For security and reliability, the NeuroTrack API logs each
            request&apos;s time, method, path, status, duration and IP address. It never logs
            request bodies, answers or access tokens.
          </li>
        </ul>
        <p>
          We use only the cookies that keep you signed in. There are no advertising or analytics
          trackers.
        </p>
      </LegalSection>

      <LegalSection heading="Who can see it">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Database row-level security limits every table so that you can read only your own
            profile, experiments and research history.
          </li>
          <li>
            Members of a BehaviourLab study (its owner and researchers) can see the study&apos;s
            pseudonyms, consent status and check-in answers, never your name, email or account. They
            see group-level associations, which are not causes and say nothing certain about any
            individual.
          </li>
          <li>
            When you search for literature, the search text (never your identity) is sent to the
            public Europe PMC and NCBI PubMed services to find publications.
          </li>
          <li>
            Our hosting providers (for the database, the web app and the API) process data on our
            behalf to run the service. The operator can access the database to run it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Consent in BehaviourLab">
        <p>
          Taking part in a study is voluntary. You read the participant information and consent
          before joining, and you can withdraw at any time from the study page. Withdrawing stops
          new answers from being accepted; you can also choose to delete the answers you already
          gave. Studies marked <em>synthetic</em> are practice studies whose data must not be
          treated as real research data. A study may collect real data only once it has
          institutional and ethical approval, including applicable Ugandan requirements.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it, and your choices">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Everything is kept until you delete it or your account is deleted. Deleting an account
            removes its profile, experiments, research history, study memberships, the studies it
            owns, and the links between it and any study pseudonyms. Check-in answers you gave as a
            participant stay in the study under the pseudonym, no longer linked to you, unless you
            first withdraw and choose to delete them.
          </li>
          <li>
            In{" "}
            <Link href="/settings" className="underline hover:text-ink">
              Settings
            </Link>{" "}
            you can download a copy of your data as JSON and delete your saved experiment history.
          </li>
          <li>
            To delete your whole account, ask the operator. Server logs are kept by the hosting
            providers for their standard retention period.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Educational, not clinical">
        <p>
          NeuroTrack teaches and explores neuroscience, behavioural research and quantum computing.
          It does not diagnose, predict relapse, recommend treatment or measure brain activity. If
          you are worried about your health or substance use, please contact a health professional
          or local support services.
        </p>
      </LegalSection>

      <p>
        See also the{" "}
        <Link href="/terms" className="underline hover:text-ink">
          terms of use
        </Link>
        .
      </p>
    </LegalPage>
  );
}
