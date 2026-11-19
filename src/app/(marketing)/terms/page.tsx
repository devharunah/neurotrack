import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for using NeuroTrack, an educational and experimental research platform.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="19 November 2026">
      <p>
        By creating an account or using this deployment of NeuroTrack you agree to these terms. The
        NeuroTrack software is open source under the MIT licence; these terms cover your use of this
        hosted service, which its operator runs.
      </p>

      <LegalSection heading="What NeuroTrack is, and is not">
        <p>
          NeuroTrack is an educational and experimental platform for exploring addiction
          neuroscience, behavioural research and quantum computing. It is not a medical device or a
          clinical service. It does not diagnose, predict relapse, recommend treatment or measure
          brain activity, and its outputs must not be used to make decisions about any
          individual&apos;s health or care.
        </p>
        <p>
          Models are simplified and documented with their assumptions and references. Behavioural
          analytics report associations, which are not causes. Quantum results are compared with
          classical baselines and claim no advantage without evidence. Literature summaries quote
          retrieved sources and can be incomplete; read the cited publications before relying on
          them.
        </p>
      </LegalSection>

      <LegalSection heading="Your responsibilities">
        <ul className="list-disc space-y-2 pl-5">
          <li>Keep your sign-in details secret, and use the service lawfully.</li>
          <li>
            Do not try to access other people&apos;s data, bypass rate limits or security controls,
            or disrupt the service. Report vulnerabilities as described in the project&apos;s
            security policy instead of exploiting them.
          </li>
          <li>
            Do not enter names, contact details or other identifying information about anyone into
            free-text fields, study descriptions or questionnaires.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Running studies">
        <p>
          If you create a BehaviourLab study, you are responsible for it. Studies start with
          synthetic data. Before collecting real participant data you must hold institutional and
          ethical approval, including applicable Ugandan requirements, and record its reference in
          the study settings. You must give participants accurate information, respect withdrawal of
          consent, use pseudonymous exports only for the approved purpose, and never attempt to
          re-identify a participant.
        </p>
      </LegalSection>

      <LegalSection heading="Availability and liability">
        <p>
          The service is provided as is, without warranties of any kind, and may change, be rate
          limited or become unavailable at any time. To the extent the law allows, the operator and
          the NeuroTrack contributors are not liable for any loss arising from its use. Download
          anything you want to keep.
        </p>
      </LegalSection>

      <LegalSection heading="Your data and changes to these terms">
        <p>
          How your data is handled is described in the{" "}
          <Link href="/privacy" className="underline hover:text-ink">
            privacy notice
          </Link>
          . The operator may update these terms; the date above shows the latest version. If you do
          not agree, stop using the service and ask the operator to delete your account.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
