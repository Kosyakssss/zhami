import { describe, expect, test } from "bun:test";
import { named, plan, Search } from "../src/rename";
import { moment, north, period } from "./setup";

const around = moment("2026-11-13", "YYYY-MM-DD");

describe("renaming notes", () => {
  const week = period("week");
  const search = new Search(week, north, around);
  const weeks = search.more(1000);

  test("a search finds occurrences outward from a date, without gaps", () => {
    expect(weeks.slice(0, 3).map((w) => w.start.format("YYYY-MM-DD"))).toEqual(["2026-11-09", "2026-11-16", "2026-11-02"]);
    const sorted = [...weeks].sort((a, b) => a.start.valueOf() - b.start.valueOf());
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.start.diff(sorted[i - 1]!.end, "ms")).toBe(1);
    }
    expect([search.from, search.to]).toEqual([2007, 2046]);
  });

  test("a search ends at the years 1 and 9999, or where a period's data does", () => {
    const run = (key: string) => {
      const s = new Search(period(key), north, around);
      let count = 0;
      while (!s.done) count += s.more(100).length;
      return [count, s.from, s.to];
    };
    expect(run("millennium")).toEqual([10, 1, 9001]);
    expect(run("century")).toEqual([100, 1, 9901]);
    // Zodiac years from 1901 to 2100; the last has no Lunar New Year after it.
    expect(run("zodiac")).toEqual([199, 1901, 2099]);
  });

  test("next and previous find a note within 100 years, or 1000 occurrences", () => {
    const find = (key: string, format: string, name: string) => named(period(key), north, format, around, name)?.start.format("YYYY-MM-DD");
    expect(find("week", "GGGG-[W]WW", "1927-W01")).toBe("1927-01-03");
    expect(find("week", "GGGG-[W]WW", "1925-W01")).toBeUndefined();
    expect(find("year", "YYYY", "1100")).toBe("1100-01-01");
    expect(find("week", "GGGG-[W]WW", "Weekly review")).toBeUndefined();
  });

  test("matches notes by the old format and names them by the new one", () => {
    const paths = ["2026-W45", "2026-W46", "2015-W01", "Weekly review", "2026-W99"];
    const result = plan(paths, week, weeks, "GGGG-[W]WW", "GGGG [week] W", () => false);
    expect(result.moves).toEqual([
      { from: "2026-W45", to: "2026 week 45" },
      { from: "2026-W46", to: "2026 week 46" },
      { from: "2015-W01", to: "2015 week 1" },
    ]);
  });

  test("* matches any text and carries it over", () => {
    const paths = ["2026-W45 trip to Kyoto", "2026-W46", "notes 2026-W46"];
    const result = plan(paths, week, weeks, "GGGG-[W]WW *", "GGGG/[W]WW *", () => false);
    expect(result.moves).toEqual([{ from: "2026-W45 trip to Kyoto", to: "2026/W45 trip to Kyoto" }]);
    const leading = plan(paths, week, weeks, "* GGGG-[W]WW", "GGGG-[W]WW (*)", () => false);
    expect(leading.moves).toEqual([{ from: "notes 2026-W46", to: "2026-W46 (notes)" }]);
  });

  test("works with Zhami's tokens", () => {
    const season = period("meteorological");
    const seasons = new Search(season, north, around).more(50);
    const result = plan(["Autumn 2026", "Winter 2025-26"], season, seasons, "{{PPPP}} YYYY{{end?:-YY}}", "{{PPP}} YY{{end?:-YY}}", () => false);
    expect(result.moves).toEqual([
      { from: "Autumn 2026", to: "Aut 26" },
      { from: "Winter 2025-26", to: "Win 25-26" },
    ]);
  });

  test("never overwrites a note", () => {
    const result = plan(["2026-W46", "2026-W46 copy"], week, weeks, "GGGG-[W]WW*", "GGGG", (p) => p === "2026");
    expect(result.moves).toEqual([]);
    expect(result.conflicts.map((c) => c.reason)).toEqual([
      "A note with this name already exists",
      "A note with this name already exists",
    ]);
    const twins = plan(["2026-W46", "2026-W46 copy"], week, weeks, "GGGG-[W]WW*", "GGGG-[W]WW", () => false);
    expect(twins.moves).toEqual([]);
    expect(twins.conflicts).toEqual([{ from: "2026-W46 copy", to: "2026-W46", reason: "Same new name as 2026-W46" }]);
  });

  test("explains what it can't do", () => {
    expect(plan(["2026-W46"], week, weeks, "GGGG-[W]WW", "{{PPPP}}", () => false).error).toBe("{{PPPP}} isn't a token for weeks");
    expect(plan([], week, weeks, "*", "GGGG", () => false).error).toBe("Find needs some text or a token around *");
    expect(plan([], week, weeks, "GGGG", "GGGG *", () => false).error).toBe("Rename to has more * than Find");
    expect(plan([], week, weeks, "{{PPPP}}", "GGGG", () => false).error).toBe("{{PPPP}} isn't a token for weeks");
  });
});
