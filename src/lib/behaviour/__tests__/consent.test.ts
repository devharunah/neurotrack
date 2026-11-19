/**
 * @jest-environment node
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CONSENT_DOCUMENTS,
  CURRENT_CONSENT_VERSION,
  consentText,
  consentTextHash,
  getConsentDocument,
  sha256Hex,
} from "../consent";

describe("consent", () => {
  it("hashes text with SHA-256 as lower-case hex", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(await sha256Hex("Ndi wano — é")).toBe(
      createHash("sha256").update("Ndi wano — é", "utf8").digest("hex"),
    );
  });

  it("commits to the exact canonical text of the current version", async () => {
    const document = getConsentDocument(CURRENT_CONSENT_VERSION);
    expect(document).not.toBeNull();
    if (!document) {
      return;
    }
    const text = consentText(document);
    expect(text).toContain(`(version ${CURRENT_CONSENT_VERSION})`);
    const hash = await consentTextHash(CURRENT_CONSENT_VERSION);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });

  it("matches the database's version format and rejects unknown versions", async () => {
    for (const version of Object.keys(CONSENT_DOCUMENTS)) {
      expect(version).toMatch(/^[0-9A-Za-z.-]{1,32}$/);
    }
    expect(getConsentDocument("9.9")).toBeNull();
    expect(getConsentDocument("toString")).toBeNull();
    expect(await consentTextHash("9.9")).toBeNull();
  });

  it("states withdrawal, pseudonymity, the ethics requirement and the non-clinical nature", () => {
    const document = getConsentDocument(CURRENT_CONSENT_VERSION);
    const text = document ? consentText(document) : "";
    expect(text).toMatch(/withdraw/i);
    expect(text).toMatch(/pseudonym/i);
    expect(text).toMatch(/Ugandan/);
    expect(text).toMatch(/not a clinical service/);
    expect(text).toMatch(/not a cause/);
  });

  it("has every published version and hash seeded in public.consent_versions", async () => {
    // join_study rejects any version/hash pair the migrations did not seed. Publishing a new
    // version therefore needs a migration that inserts its hash; this test fails until it does.
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    for (const version of Object.keys(CONSENT_DOCUMENTS)) {
      const hash = await consentTextHash(version);
      expect(sql).toContain(`('${version}', '${hash}')`);
    }
  });
});
