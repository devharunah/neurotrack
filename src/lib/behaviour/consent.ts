/**
 * Versioned participant consent. The exact text a person agreed to is identified by its version
 * and a SHA-256 hash of the text, both stored in `consents`. Never edit a published version:
 * add a new one and point CURRENT_CONSENT_VERSION at it, so old consents stay verifiable.
 */

export interface ConsentDocument {
  version: string;
  title: string;
  sections: readonly { heading: string; body: string }[];
}

const V1: ConsentDocument = {
  version: "1.0",
  title: "BehaviourLab participant information and consent",
  sections: [
    {
      heading: "What this is",
      body: "You are being invited to take part in a study run on NeuroTrack BehaviourLab, an educational and research platform. It is not a clinical service. Nothing you enter is used to diagnose you, to predict anything about you as an individual, or to recommend treatment.",
    },
    {
      heading: "What you will be asked",
      body: "At the times set by the study you will be asked short questions about your mood, stress, sleep quality, craving intensity, where you are and who you are with, and any extra questions the researchers added. A question about substance use, if the study includes it, is always voluntary and can be left unanswered.",
    },
    {
      heading: "Your pseudonym",
      body: "When you join you receive a random pseudonym such as P-7F3K. Researchers see only that pseudonym and your answers. They cannot see your name, email address or account. The link between your account and your pseudonym is stored separately and researchers have no access to it.",
    },
    {
      heading: "How your answers are used",
      body: "Researchers look at patterns across the whole study group, reported as associations with their uncertainty. An association is not a cause, and group patterns say nothing certain about any one person. Researchers may export pseudonymous answers for analysis; every export is logged.",
    },
    {
      heading: "Taking part is voluntary",
      body: "You can stop at any time without giving a reason. Withdrawing consent stops any new answers from being accepted. When you withdraw you can also choose to delete the answers you already gave.",
    },
    {
      heading: "Synthetic and real studies",
      body: "A study marked synthetic is a practice or demonstration study, and its data must not be treated as real research data. A study may only collect real participant data once it has institutional and ethical approval, including applicable Ugandan requirements; the approval reference is recorded with the study.",
    },
    {
      heading: "If you need support",
      body: "This study cannot respond to emergencies or offer care. If you are in distress or worried about your substance use, please contact a health professional or local support services.",
    },
    {
      heading: "Your agreement",
      body: "By ticking the box you confirm that you are 18 or older, that you have read this information, and that you agree to take part under these terms.",
    },
  ],
};

export const CONSENT_DOCUMENTS: Readonly<Record<string, ConsentDocument>> = { [V1.version]: V1 };

export const CURRENT_CONSENT_VERSION = V1.version;

export function getConsentDocument(version: string): ConsentDocument | null {
  return Object.hasOwn(CONSENT_DOCUMENTS, version) ? (CONSENT_DOCUMENTS[version] ?? null) : null;
}

/** The canonical plain text of a consent document: what the hash commits to. */
export function consentText(document: ConsentDocument): string {
  const body = document.sections.map((s) => `${s.heading}\n${s.body}`).join("\n\n");
  return `${document.title} (version ${document.version})\n\n${body}\n`;
}

/** Lower-case hex SHA-256 of the UTF-8 text, via Web Crypto (browsers and Node 20+). */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function consentTextHash(version: string): Promise<string | null> {
  const document = getConsentDocument(version);
  return document ? sha256Hex(consentText(document)) : null;
}
