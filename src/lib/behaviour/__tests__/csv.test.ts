import { escapeCsvCell, slugify, toCsv } from "../csv";

describe("escapeCsvCell", () => {
  it.each([
    ['=HYPERLINK("http://x")', `"'=HYPERLINK(""http://x"")"`],
    ["+1+2", "'+1+2"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["\tcmd", "'\tcmd"],
    ["\r=1", `"'\r=1"`],
  ])("neutralises the formula trigger in %j", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("quotes commas, quotes, newlines and edge whitespace", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeCsvCell(" padded")).toBe('" padded"');
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  it("writes numbers, booleans and blanks without a prefix", () => {
    expect(escapeCsvCell(7)).toBe("7");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(Number.NaN)).toBe("");
    expect(escapeCsvCell(true)).toBe("true");
    expect(escapeCsvCell(false)).toBe("false");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("joins with CRLF and ends with a newline", () => {
    expect(
      toCsv(
        ["a", "b"],
        [
          [1, "=x"],
          [null, "y,z"],
        ],
      ),
    ).toBe(`a,b\r\n1,'=x\r\n,"y,z"\r\n`);
  });
});

describe("slugify", () => {
  it("makes a safe filename stem", () => {
    expect(slugify("Stress & Craving — Kampala 2026!")).toBe("stress-craving-kampala-2026");
    expect(slugify("Éducation")).toBe("education");
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("!!!")).toBe("study");
  });
});
