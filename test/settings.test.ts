import { expect, test } from "bun:test";
import { load } from "../src/settings";
import "./setup";

test("settings from before 0.2 lose old defaults and {{n}} tokens, and keep everything chosen", () => {
  // As the previous version saved them: every period's format, defaults included.
  const old = {
    folder: "Calendar",
    hemisphere: "north",
    enabled: { week: true, month: false, quarter: true, year: true, season: false, millennium: true },
    folders: { week: "", fortnight: "", season: "" },
    formats: {
      week: "GGGG-[W]WW",
      fortnight: "GGGG-[F]{{n}}",
      month: "YYYY-MM",
      season: "{{season}} YYYY",
      half: "YYYY-[H]{n}",
      decade: "{{n}}[s]",
      century: "{{nth}} [century]",
      year: "[Year ]YYYY",
      academic: "{{years:YY-YY}}",
    },
    templates: { week: "Templates/Week.md", fortnight: "", season: "" },
    dates: {},
  };
  expect(load(old)).toEqual({
    folder: "Calendar",
    hemisphere: "north",
    enabled: { week: true, month: false, quarter: true, year: true, millennium: true },
    folders: {},
    formats: { year: "[Year ]YYYY" },
    templates: { week: "Templates/Week.md" },
    dates: {},
  });
});

test("nothing saved means the defaults", () => {
  expect(load(null).enabled).toEqual({ week: true, month: true, quarter: true, year: true });
});
