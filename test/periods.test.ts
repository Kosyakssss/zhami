import { describe, expect, test } from "bun:test";
import { sunSteps } from "../src/astro";
import { next, PERIODS, previous } from "../src/periods";
import { named } from "../src/rename";
import hko from "./fixtures/hko.json";
import { at, moment, north, period, south } from "./setup";

describe("calendar periods", () => {
  test("week, by ISO week, including week 53 on New Year's Day", () => {
    expect(at("week", "2026-11-13")).toMatchObject({ name: "2026-W46", start: "2026-11-09", end: "2026-11-15" });
    expect(at("week", "2027-01-01")).toMatchObject({ name: "2026-W53", start: "2026-12-28", end: "2027-01-03" });
  });

  test("fortnight pairs ISO weeks, and the 27th is one week long", () => {
    expect(at("fortnight", "2026-11-13")).toMatchObject({ name: "2026-F23", start: "2026-11-02", end: "2026-11-15" });
    expect(at("fortnight", "2027-01-01")).toMatchObject({ name: "2026-F27", start: "2026-12-28", end: "2027-01-03" });
    expect(at("fortnight", "2026-01-05")).toMatchObject({ name: "2026-F01", start: "2025-12-29", end: "2026-01-11" });
  });

  test("month, quarter, half-year and year", () => {
    expect(at("month", "2026-11-13")).toMatchObject({ name: "2026-11", start: "2026-11-01", end: "2026-11-30" });
    expect(at("quarter", "2026-11-13")).toMatchObject({ name: "2026-Q4", start: "2026-10-01", end: "2026-12-31" });
    expect(at("half", "2026-06-30")).toMatchObject({ name: "2026-H1", start: "2026-01-01", end: "2026-06-30" });
    expect(at("half", "2026-07-01")).toMatchObject({ name: "2026-H2", start: "2026-07-01", end: "2026-12-31" });
    expect(at("year", "2026-11-13")).toMatchObject({ name: "2026", start: "2026-01-01", end: "2026-12-31" });
  });

  test("decades start at 0, centuries and millennia at 1", () => {
    expect(at("decade", "2026-11-13")).toMatchObject({ name: "2020s", start: "2020-01-01", end: "2029-12-31" });
    expect(at("century", "2000-12-31")).toMatchObject({ name: "20th century", start: "1901-01-01", end: "2000-12-31" });
    expect(at("century", "2001-01-01")).toMatchObject({ name: "21st century", start: "2001-01-01", end: "2100-12-31" });
    expect(at("millennium", "2026-11-13")).toMatchObject({ name: "3rd millennium", start: "2001-01-01", end: "3000-12-31" });
  });
});

describe("seasons", () => {
  test("meteorological winter crosses New Year and takes both years", () => {
    expect(at("meteorological", "2026-11-13")).toMatchObject({ name: "Autumn 2026", start: "2026-09-01", end: "2026-11-30" });
    expect(at("meteorological", "2027-01-10")).toMatchObject({ name: "Winter 2026-27", start: "2026-12-01", end: "2027-02-28" });
    expect(at("meteorological", "2027-01-10", "{{PPPP}} YYYY-{{end:YYYY}}").name).toBe("Winter 2026-2027");
    expect(at("meteorological", "2027-01-10", "{{PPP}} YY").name).toBe("Win 26");
  });

  test("the southern hemisphere flips the names", () => {
    expect(at("meteorological", "2026-11-13", undefined, south).name).toBe("Spring 2026");
    expect(at("meteorological", "2027-01-10", undefined, south).name).toBe("Summer 2026-27");
  });

  test("astronomical seasons start at the equinox or solstice", () => {
    expect(at("astronomical", "2026-11-13")).toMatchObject({ name: "Autumn 2026", start: "2026-09-23", end: "2026-12-20" });
    expect(at("astronomical", "2026-12-21")).toMatchObject({ name: "Winter 2026-27", start: "2026-12-21", end: "2027-03-19" });
    expect(at("astronomical", "2026-11-13", "{{PPPP:fall}} YYYY").name).toBe("Fall 2026");
  });

  test("the Wheel of the Year, in both hemispheres", () => {
    expect(at("wheel", "2026-11-13")).toMatchObject({ name: "Samhain 2026", start: "2026-11-01", end: "2026-12-20" });
    expect(at("wheel", "2026-12-25")).toMatchObject({ name: "Yule 2026-27", start: "2026-12-21", end: "2027-01-31" });
    expect(at("wheel", "2026-11-13", undefined, south).name).toBe("Beltane 2026");
    expect(at("wheel", "2026-06-25", undefined, south).name).toBe("Yule 2026");
  });
});

describe("work", () => {
  test("fashion seasons use their start dates, defaulting to February and August", () => {
    expect(at("fashion", "2026-11-13")).toMatchObject({ name: "FW26", start: "2026-08-01", end: "2027-01-31" });
    expect(at("fashion", "2027-01-31").name).toBe("FW26");
    expect(at("fashion", "2027-02-01").name).toBe("SS27");
    expect(at("fashion", "2026-11-13", "{{PPPP:autumn}} YYYY{{end?:-YY}}").name).toBe("Autumn-winter 2026-27");
    const custom = { hemisphere: "north" as const, dates: { "spring-summer": "01-01", "fall-winter": "07-01" } };
    expect(at("fashion", "2026-06-30", undefined, custom)).toMatchObject({ name: "SS26", start: "2026-01-01", end: "2026-06-30" });
  });

  test("fiscal quarters know their fiscal year", () => {
    expect(at("fiscal-quarter", "2026-11-13")).toMatchObject({ name: "FY2026 Q3", start: "2026-10-01", end: "2026-12-31" });
    expect(at("fiscal-quarter", "2027-02-01").name).toBe("FY2026 Q4");
    expect(at("fiscal-quarter", "2027-02-01", "[FY]{{fy:YYYY}}-{{fyend:YY}} [Q]{{P}}").name).toBe("FY2026-27 Q4");
    expect(at("fiscal-year", "2027-02-01", "[FY]{{end:YYYY}}")).toMatchObject({ name: "FY2027", start: "2026-04-01" });
  });

  test("academic years cross New Year", () => {
    expect(at("academic", "2026-11-13")).toMatchObject({ name: "2026-27", start: "2026-09-01", end: "2027-08-31" });
  });
});

describe("Japan, China, Korea, India", () => {
  test("sekki and kō", () => {
    expect(at("sekki", "2026-11-13")).toMatchObject({ name: "Rittō 2026", start: "2026-11-07", end: "2026-11-21" });
    expect(at("sekki", "2026-11-13", "{{PPPP:kanji}} {{PPPP:english}}").name).toBe("立冬 Beginning of winter");
    const ko = at("ko", "2026-11-13", "{{PP}} {{PPPP:kanji}} {{PPPP}} · {{PPPP:sekki}}");
    expect(ko.name).toBe("56 地始凍 Chi hajimete kōru · Rittō");
    expect(at("ko", "2026-11-13").name).toBe("Land starts to freeze 2026");
  });

  test("every kō is about five days, and three fill each sekki", () => {
    let m = moment("2026-02-04", "YYYY-MM-DD");
    const ko = period("ko");
    const sekki = period("sekki");
    for (let i = 0; i < 72; i++) {
      const k = ko.at(m, north);
      const days = k.end.diff(k.start, "days") + 1;
      expect(days).toBeGreaterThanOrEqual(4);
      expect(days).toBeLessThanOrEqual(6);
      const s = sekki.at(m, north);
      expect(Math.ceil(k.n! / 3)).toBe(s.n!);
      m = k.end.clone().add(1, "day");
    }
  });

  test("zodiac years start at Lunar New Year, including 2033's late leap month", () => {
    expect(at("zodiac", "2026-11-13")).toMatchObject({ name: "Fire Horse 2026", start: "2026-02-17", end: "2027-02-05" });
    expect(at("zodiac", "2026-02-16").name).toBe("Wood Snake 2025");
    expect(at("zodiac", "2033-01-31", "{{PPPP:ganzhi}} {{PPPP:hanzi}}").name).toBe("癸丑 牛");
    expect(at("zodiac", "1984-02-02", "{{PPPP:element}} {{PPPP}}").name).toBe("Wood Rat");
    expect(() => at("zodiac", "2100-06-01")).toThrow();
  });

  test("the stored Lunar New Year dates decode to the Hong Kong Observatory's", () => {
    const zodiac = period("zodiac");
    // 2100's year has no end in the table, so it's the last one checked.
    for (const date of Object.values(hko.lunarNewYear).slice(0, -1)) {
      expect(zodiac.at(moment(date, "YYYY-MM-DD"), north).start.format("YYYY-MM-DD")).toBe(date);
    }
  });

  test("Chinese and Korean solar terms", () => {
    expect(at("jieqi", "2026-11-13", "{{PPPP}} {{PPPP:hanzi}} {{PPPP:traditional}}").name).toBe("Lìdōng 立冬 立冬");
    expect(at("jieqi", "2026-03-10", "{{PPPP:hanzi}} {{PPPP:traditional}}").name).toBe("惊蛰 驚蟄");
    expect(at("jeolgi", "2026-11-13", "{{PPPP}} {{PPPP:hangul}}").name).toBe("Ipdong 입동");
  });

  test("ṛtu match Drik Panchang's tropical timings for 2026", () => {
    // drikpanchang.com/seasons/season-tropical-timings.html?year=2026, in India time.
    const starts = ["2026-02-18", "2026-04-20", "2026-06-21", "2026-08-23", "2026-10-23", "2026-12-22"];
    const names = ["Vasanta", "Grishma", "Varsha", "Sharad", "Hemanta", "Shishira"];
    starts.forEach((date, i) => {
      expect(at("ritu", date, "{{PPPP:plain}}")).toMatchObject({ name: names[i], start: date });
    });
    expect(at("ritu", "2027-01-10")).toMatchObject({ name: "Śiśira 2026-27", end: "2027-02-18" });
  });
});

describe("the sun", () => {
  // The Hong Kong Observatory dates all 24 solar terms for 1901 to 2100, in
  // UTC+8. A term that starts within minutes of midnight can land on either
  // side of it, depending on the ephemeris, so only those may differ.
  test("solar terms match the Hong Kong Observatory, except within 15 minutes of midnight", () => {
    const differ: string[] = [];
    for (const [year, dates] of Object.entries(hko.terms)) {
      const ours = sunSteps(+year, 15, 0)
        .map((s) => ({ ms: s.at + 8 * 3_600_000, date: new Date(s.at + 8 * 3_600_000).toISOString().slice(5, 10) }))
        .sort((a, b) => a.ms - b.ms);
      dates.forEach((date, i) => {
        const term = ours[i]!;
        if (term.date === date) return;
        const minutes = (term.ms % 86_400_000) / 60_000;
        const nearMidnight = Math.min(minutes, 1440 - minutes) < 15;
        if (!nearMidnight) differ.push(`${year}-${date}, ours ${term.date}`);
      });
    }
    expect(differ).toEqual([]);
  });
});

describe("next and previous", () => {
  test("every period steps forward and back without gaps or overlaps", () => {
    for (const p of PERIODS) {
      let instance = p.at(moment("2026-11-13", "YYYY-MM-DD"), north);
      const start = instance.start.format("YYYY-MM-DD");
      const steps = p.key === "millennium" ? 3 : 30;
      for (let i = 0; i < steps; i++) {
        const following = next(p, north, instance);
        expect([p.key, following.start.diff(instance.end, "ms")]).toEqual([p.key, 1]);
        instance = following;
      }
      for (let i = 0; i < steps; i++) instance = previous(p, north, instance);
      expect([p.key, instance.start.format("YYYY-MM-DD")]).toEqual([p.key, start]);
    }
  });

  test("the sun's periods work in the years before 100", () => {
    const at = period("sekki").at(moment("0050-06-30", "YYYY-MM-DD"), north);
    // Geshi, the June solstice, starts June 21 or 22 in Japan, in the
    // proleptic Gregorian calendar moment uses.
    expect([at.labels?.PPPP, at.start.format("YYYY-MM")]).toEqual(["Geshi", "0050-06"]);
    expect(at.start.date()).toBeGreaterThanOrEqual(19);
  });

  test("a note's name tells which occurrence it is", () => {
    const today = moment("2026-11-13", "YYYY-MM-DD");
    const week = (name: string) => named(period("week"), north, "GGGG-[W]WW", today, name);
    expect(week("2026-W40")!.start.format("YYYY-MM-DD")).toBe("2026-09-28");
    expect(week("2026-W53")!.end.format("YYYY-MM-DD")).toBe("2027-01-03");
    expect(week("1999-W01")!.start.format("YYYY-MM-DD")).toBe("1999-01-04");
    expect(week("2026-W54")).toBeUndefined();
    expect(week("Weekly review")).toBeUndefined();
    const season = named(period("meteorological"), north, "{{PPPP}} YYYY{{end?:-YY}}", today, "Winter 2026-27");
    expect(season!.start.format("YYYY-MM-DD")).toBe("2026-12-01");
  });
});
