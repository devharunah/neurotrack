import {
  formatAuthors,
  identityKeys,
  referenceLinks,
  toCacheRow,
  toLiteratureReference,
} from "../references";
import type { LiteratureReference } from "../types";

const base: LiteratureReference = toLiteratureReference({
  source: "pubmed",
  pmid: "27069377",
  pmcid: "PMC4826767",
  doi: "10.31887/dcns.2016.18.1/wschultz",
  title: "Dopamine reward prediction error coding.",
  authors: ["Schultz W"],
  journal: "Dialogues in clinical neuroscience",
  year: 2016,
  abstract: "Reward prediction errors consist of ...",
  publication_types: ["Journal Article", "Review"],
  url: "https://pubmed.ncbi.nlm.nih.gov/27069377/",
  evidence: "review",
});

describe("toLiteratureReference", () => {
  it("fills optional fields and rejects unknown labels", () => {
    expect(
      toLiteratureReference({
        source: "europepmc",
        title: "T",
        url: "https://x",
        evidence: "gold",
      }),
    ).toEqual({
      source: "europepmc",
      pmid: null,
      pmcid: null,
      doi: null,
      title: "T",
      authors: [],
      journal: null,
      year: null,
      abstract: null,
      publication_types: [],
      url: "https://x",
      evidence: "other",
    });
  });
});

describe("toCacheRow", () => {
  it("passes a well-formed reference through", () => {
    expect(toCacheRow(base)).toEqual(base);
  });

  it("drops malformed identifiers but keeps the record if one identifier survives", () => {
    const row = toCacheRow({ ...base, pmid: "PMC123", pmcid: "123", doi: "10.1/X" });
    expect(row).toBeNull(); // bad pmid, and a DOI with a 1-digit registrant is invalid
    const kept = toCacheRow({ ...base, pmid: "abc", doi: "10.1234/ABC" });
    expect(kept?.pmid).toBeNull();
    expect(kept?.doi).toBe("10.1234/abc");
  });

  it("refuses records with no identifier, no title or a non-https URL", () => {
    expect(toCacheRow({ ...base, pmid: null, doi: null })).toBeNull();
    expect(toCacheRow({ ...base, title: "   " })).toBeNull();
    expect(toCacheRow({ ...base, url: "http://insecure.example" })).toBeNull();
  });

  it("clips long text and nulls impossible years", () => {
    const row = toCacheRow({ ...base, abstract: "a".repeat(60_000), year: 3000 });
    expect(row?.abstract).toHaveLength(50_000);
    expect(row?.abstract?.endsWith("…")).toBe(true);
    expect(row?.year).toBeNull();
    expect(toCacheRow({ ...base, journal: "  " })?.journal).toBeNull();
  });
});

describe("referenceLinks", () => {
  it("links to the DOI resolver, PubMed and Europe PMC", () => {
    expect(referenceLinks(base)).toEqual({
      doi: "https://doi.org/10.31887/dcns.2016.18.1/wschultz",
      pubmed: "https://pubmed.ncbi.nlm.nih.gov/27069377/",
      europepmc: "https://europepmc.org/article/MED/27069377",
    });
  });

  it("keeps the Europe PMC record URL for preprints without a PMID", () => {
    const links = referenceLinks({
      source: "europepmc",
      pmid: null,
      pmcid: null,
      doi: "10.1101/2024.01.01.123<x>",
      url: "https://europepmc.org/article/PPR/PPR123",
    });
    expect(links.pubmed).toBeNull();
    expect(links.europepmc).toBe("https://europepmc.org/article/PPR/PPR123");
    expect(links.doi).toBe("https://doi.org/10.1101/2024.01.01.123%3Cx%3E");
  });

  it("falls back to a DOI search on Europe PMC", () => {
    const links = referenceLinks({
      source: "pubmed",
      pmid: null,
      pmcid: null,
      doi: "10.1234/abc",
      url: "https://example.org",
    });
    expect(links.europepmc).toBe("https://europepmc.org/search?query=DOI%3A%2210.1234%2Fabc%22");
  });
});

describe("identityKeys and formatAuthors", () => {
  it("keys by PMID and lowercase DOI", () => {
    expect(identityKeys({ pmid: "1", doi: "10.1/ABC" })).toEqual(["pmid:1", "doi:10.1/abc"]);
    expect(identityKeys({ pmid: null, doi: null })).toEqual([]);
  });

  it("shortens long author lists", () => {
    expect(formatAuthors([])).toBe("Authors not listed");
    expect(formatAuthors(["A", "B"])).toBe("A, B");
    expect(formatAuthors(["A", "B", "C", "D"])).toBe("A, B, C, et al.");
  });
});
