import { describe, expect, test } from "bun:test";
import { fill, reference, render } from "../src/format";
import { PERIODS } from "../src/periods";
import { at, moment, north } from "./setup";

describe("name formats", () => {
  test("moment's tokens work as in Daily notes", () => {
    expect(at("month", "2026-11-13", "MMMM YYYY").name).toBe("November 2026");
    expect(at("week", "2026-11-13", "[Week] Wo, GGGG").name).toBe("Week 46th, 2026");
  });

  test("Zhami's tokens work outside and inside moment's brackets", () => {
    expect(at("fortnight", "2026-11-13", "{{P}}").name).toBe("23");
    expect(at("fortnight", "2026-11-13", "[F{{PP}} of] GGGG").name).toBe("F23 of 2026");
    expect(at("century", "2026-11-13", "[the {{Po}} century]").name).toBe("the 21st century");
  });

  test("names made of letters moment would read stay intact", () => {
    // "Autumn" has moment tokens (A, m), "Shishira" too (s, h, a).
    expect(at("meteorological", "2026-11-13", "{{PPPP}}").name).toBe("Autumn");
    expect(at("ritu", "2027-01-10", "{{PPPP:plain}}").name).toBe("Shishira");
  });

  test("tokens are case-sensitive", () => {
    expect(at("fortnight", "2026-11-13", "{{p}}").errors).toEqual(["{{p}} isn't a token for fortnights"]);
  });

  test("unknown tokens and variants are errors, not moment input", () => {
    const typo = at("meteorological", "2026-11-13", "{{PPPPP}} YYYY");
    expect(typo.errors).toEqual(["{{PPPPP}} isn't a token for meteorological seasons"]);
    expect(typo.name).toBe("{{PPPPP}} 2026");
    expect(at("sekki", "2026-11-13", "{{PPPP:french}}").errors).toHaveLength(1);
  });

  test("periods moment covers have no {{P}}", () => {
    expect(at("week", "2026-11-13", "{{P}}").errors).toEqual(["{{P}} isn't a token for weeks"]);
    expect(at("decade", "2026-11-13", "{{P}}").errors).toHaveLength(1);
  });

  test("{{end?}} appears only where the last day looks different from the first", () => {
    expect(at("meteorological", "2026-11-13", "{{PPPP}} YYYY{{end?:-YY}}").name).toBe("Autumn 2026");
    expect(at("meteorological", "2027-01-10", "{{PPPP}} YYYY{{end?:-YY}}").name).toBe("Winter 2026-27");
    expect(at("meteorological", "2027-01-10", "{{PPPP}} YYYY{{end?:[ to ]YYYY}}").name).toBe("Winter 2026 to 2027");
    expect(at("week", "2026-11-13", "{{start:MMM D}}–{{end?:MMM }}{{end:D}}").name).toBe("Nov 9–15");
    expect(at("week", "2026-12-01", "{{start:MMM D}}–{{end?:MMM }}{{end:D}}").name).toBe("Nov 30–Dec 6");
  });

  test("{{start}} and {{end}} give exactly the format written, spaces included", () => {
    expect(at("meteorological", "2026-11-13", "YY-{{end:YY}}").name).toBe("26-26");
    expect(at("century", "2026-11-13", "YY-{{end:YY}}").name).toBe("01-00");
    expect(at("century", "2026-11-13", "YYYY-{{end:YYYY}}").name).toBe("2001-2100");
    expect(at("meteorological", "2027-01-10", "YYYY{{end?: – YYYY}}").name).toBe("2026 – 2027");
  });

  test("{{start}} and {{end}} take any moment format", () => {
    expect(at("week", "2026-11-13", "{{start:MMM D}}–{{end:D}}").name).toBe("Nov 9–15");
  });

  test("slashes make subfolders", () => {
    expect(at("week", "2026-11-13", "GGGG/[W]WW").name).toBe("2026/W46");
  });
});

describe("templates", () => {
  test("fill core variables, Zhami's tokens, and leave others alone", () => {
    const { instance } = at("quarter", "2026-11-13");
    const now = moment("2026-11-13 09:30", "YYYY-MM-DD HH:mm");
    const text = "{{title}} {{date}} {{time}} {{date:dddd}} due {{end}} from {{start:MMM D}} {{tp.file.title}} <% x %>";
    expect(fill(text, "2026-Q4", now, instance)).toBe(
      "2026-Q4 2026-11-13 09:30 Friday due 2026-12-31 from Oct 1 {{tp.file.title}} <% x %>",
    );
  });

  test("fill names in templates too", () => {
    const { instance } = at("sekki", "2026-11-13");
    expect(fill("{{PPPP}} ({{PPPP:kanji}}), sekki {{P}}", "x", moment(), instance)).toBe("Rittō (立冬), sekki 19");
  });
});

describe("settings and docs", () => {
  test("every period's examples and reference tokens work, through a whole year", () => {
    for (const p of PERIODS) {
      for (let m = moment("2026-01-01", "YYYY-MM-DD"); m.year() === 2026; m.add(5, "days")) {
        const instance = p.at(m, north);
        for (const format of p.examples) expect([p.key, render(format, p, instance).errors]).toEqual([p.key, []]);
        for (const row of reference(p, instance)) {
          expect([row.token, render(row.token, p, instance).errors]).toEqual([row.token, []]);
          // Only {{end?}} may give nothing, when the period stays in one year.
          if (!row.token.includes("?")) expect(row.value).not.toBe("");
        }
      }
    }
  });
});
