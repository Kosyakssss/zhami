import { describe, expect, test } from "bun:test";
import { instances, plan } from "../src/rename";
import { moment, north, period } from "./setup";

const around = moment("2026-11-13", "YYYY-MM-DD");

describe("renaming notes", () => {
  const week = period("week");
  const weeks = instances(week, north, around, 1000);

  test("instances run in order around a date, without gaps", () => {
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i]!.start.diff(weeks[i - 1]!.end, "ms")).toBe(1);
    }
    expect(weeks.length).toBe(2000);
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
    const seasons = instances(season, north, around, 50);
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
    expect(plan([], week, weeks, "*", "GGGG", () => false).error).toBe("Find needs some text or a token around *");
    expect(plan([], week, weeks, "GGGG", "GGGG *", () => false).error).toBe("Rename to has more * than Find");
    expect(plan([], week, weeks, "{{PPPP}}", "GGGG", () => false).error).toBe("{{PPPP}} isn't a token for weeks");
  });
});
