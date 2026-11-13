import type { Moment } from "moment";
import { sunSteps } from "./astro";
import { day, moment } from "./moment";
import { JEOLGI, JIEQI, KO, LUNAR_NEW_YEAR, LUNAR_NEW_YEAR_FROM, SEKKI } from "./names";

export type Hemisphere = "north" | "south";

export interface Context {
  hemisphere: Hemisphere;
  // Start dates the user picks, as MM-DD, by period setting key.
  dates: Record<string, string>;
}

// One occurrence of a period: this week, Autumn 2026, the 23rd fortnight.
export interface Instance {
  start: Moment;
  end: Moment;
  // Its number, for {{P}}: 1 to 27 for fortnights, 21 for this century.
  n?: number;
  // Names for {{PPP}} and {{PPPP}}, keyed by token, like "PPPP:kanji".
  labels?: Record<string, string>;
  // The fiscal year a fiscal quarter belongs to, for {{fy}} and {{fyend}}.
  year?: { start: Moment; end: Moment };
}

export type Group = "Calendar" | "Seasons" | "Work" | "Japan" | "China" | "Korea" | "India";

export interface Period {
  key: string;
  name: string;
  group: Group;
  // When it starts and ends, in a few words.
  span: string;
  format: string;
  // Formats to pick from in settings and the docs.
  examples: string[];
  // What {{P}} counts, for periods that have a number moment can't give.
  number?: string;
  // Names, by token, and what each one gives.
  labels?: Record<string, string>;
  // Moment's own tokens worth knowing for this period.
  momentTokens?: Record<string, string>;
  // Start dates the user can change, as MM-DD.
  dates?: { key: string; name: string; default: string }[];
  // Whose clock decides the date, for periods that start at an instant,
  // to follow "Dated in".
  clock?: string;
  // What commands call it, when its name doesn't read well after "Open this".
  noun?: string;
  at(m: Moment, ctx: Context): Instance;
}

export const DATE_DEFAULTS: Record<string, string> = {
  "spring-summer": "02-01",
  "fall-winter": "08-01",
  fiscal: "04-01",
  academic: "09-01",
};

// Periods moment knows natively.
function unit(u: "isoWeek" | "month" | "quarter" | "year") {
  return (m: Moment): Instance => ({ start: m.clone().startOf(u), end: m.clone().endOf(u) });
}

// Spans of years. Decades start at 2020. Centuries and millennia are
// ordinal, so the 21st century runs from 2001 to 2100.
function years(span: number, ordinal: boolean) {
  return (m: Moment): Instance => {
    const y = m.year();
    const first = ordinal ? Math.floor((y - 1) / span) * span + 1 : y - (((y % span) + span) % span);
    const start = m.clone().year(first).startOf("year");
    return {
      start,
      end: start.clone().add(span - 1, "years").endOf("year"),
      n: ordinal ? Math.ceil(y / span) : undefined,
    };
  };
}

// A start date and what it starts.
interface Mark {
  date: string;
  n: number;
  labels?: Record<string, string>;
  year?: { start: Moment; end: Moment };
}

const pad = (y: number) => String(y).padStart(4, "0");
const local = (ms: number) => moment(ms).format("YYYY-MM-DD");
// The date at an instant in a fixed time zone, like Japan's UTC+9.
const zoned = (hours: number) => (ms: number) => new Date(ms + hours * 3_600_000).toISOString().slice(0, 10);

// A period made of start dates. `list` gives the marks that fall in one
// calendar year; the instance around `m` runs from the last mark on or
// before it to the day before the next.
function marks(list: (year: number, ctx: Context) => Mark[]) {
  const cache = new Map<string, Mark[]>();
  const year = (y: number, ctx: Context) => {
    const key = `${y}|${ctx.hemisphere}|${JSON.stringify(ctx.dates)}`;
    let found = cache.get(key);
    if (!found) {
      found = list(y, ctx);
      if (cache.size > 2000) cache.clear();
      cache.set(key, found);
    }
    return found;
  };
  return (m: Moment, ctx: Context): Instance => {
    const today = m.format("YYYY-MM-DD");
    const y = m.year();
    const all = [...year(y - 1, ctx), ...year(y, ctx), ...year(y + 1, ctx)].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
    let i = all.length - 1;
    while (i >= 0 && all[i]!.date > today) i--;
    const mark = all[i];
    const next = all[i + 1];
    if (!mark || !next) throw new Error(`Zhami: no period around ${today}`);
    return {
      start: day(mark.date),
      end: day(next.date).subtract(1, "day").endOf("day"),
      n: mark.n,
      labels: mark.labels,
      year: mark.year,
    };
  };
}

// The same MM-DD every year, from the user's settings.
const each = (key: string) => (y: number, ctx: Context) => `${pad(y)}-${ctx.dates[key] || DATE_DEFAULTS[key]}`;

// Seasons are numbered from March, whichever hemisphere: 1 is the season
// that starts in March.
const SEASONS: Record<Hemisphere, string[]> = {
  north: ["Spring", "Summer", "Autumn", "Winter"],
  south: ["Autumn", "Winter", "Spring", "Summer"],
};
const season = (n: number, ctx: Context) => {
  const name = SEASONS[ctx.hemisphere][n - 1]!;
  return { PPPP: name, "PPPP:fall": name === "Autumn" ? "Fall" : name, PPP: name.slice(0, 3) };
};
const SEASON_LABELS = {
  PPPP: "Spring, Summer, Autumn or Winter",
  "PPPP:fall": "Spring, Summer, Fall or Winter",
  PPP: "Spr, Sum, Aut or Win",
};

// The Wheel of the Year: cross-quarter days on fixed dates, and the
// solstices and equinoxes. Numbered from Samhain, the Celtic new year.
const FESTIVALS = ["Samhain", "Yule", "Imbolc", "Ostara", "Beltane", "Litha", "Lughnasadh", "Mabon"];

const ANIMALS = ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"];
const ANIMALS_HANZI = "鼠牛虎兔龙蛇马羊猴鸡狗猪";
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"];

const RITU = [
  { iast: "Vasanta", plain: "Vasanta", devanagari: "वसन्त", english: "Spring" },
  { iast: "Grīṣma", plain: "Grishma", devanagari: "ग्रीष्म", english: "Summer" },
  { iast: "Varṣā", plain: "Varsha", devanagari: "वर्षा", english: "Monsoon" },
  { iast: "Śarad", plain: "Sharad", devanagari: "शरत्", english: "Autumn" },
  { iast: "Hemanta", plain: "Hemanta", devanagari: "हेमन्त", english: "Pre-winter" },
  { iast: "Śiśira", plain: "Shishira", devanagari: "शिशिर", english: "Winter" },
];

// Periods that start when the sun reaches a longitude: every `step`
// degrees from `offset`, dated in a time zone.
function sun(step: number, offset: number, date: (ms: number) => string, labels: (n: number) => Record<string, string>) {
  return marks((y) =>
    sunSteps(y, step, offset).map(({ at, index }) => ({ date: date(at), n: index + 1, labels: labels(index + 1) })),
  );
}

const FISCAL = (y: number, ctx: Context) => day(each("fiscal")(y, ctx));

export const PERIODS: Period[] = [
  {
    key: "week",
    name: "Week",
    group: "Calendar",
    span: "An ISO week, Monday to Sunday",
    format: "GGGG-[W]WW",
    examples: ["GGGG-[W]WW", "GGGG [week] W", "{{start:MMM D}}–{{end:D}}", "GGGG/[W]WW"],
    momentTokens: {
      W: "Week of the ISO year, 1 to 53",
      WW: "W with two digits",
      Wo: "W as an ordinal",
      GGGG: "ISO year. Use it with weeks instead of YYYY",
    },
    at: unit("isoWeek"),
  },
  {
    key: "fortnight",
    name: "Fortnight",
    group: "Calendar",
    span: "Two ISO weeks: 1 and 2, 3 and 4, and so on",
    format: "GGGG-[F]{{PP}}",
    examples: ["GGGG-[F]{{PP}}", "GGGG [fortnight] {{P}}", "{{start:MMM D}}–{{end:MMM D}}"],
    number: "Fortnight of the ISO year, 1 to 27",
    momentTokens: { GGGG: "ISO year" },
    at: (m) => {
      const n = Math.ceil(m.isoWeek() / 2);
      const first = m.clone().isoWeek(n * 2 - 1);
      const second = first.clone().add(1, "week");
      return {
        start: first.clone().startOf("isoWeek"),
        end: (second.isoWeek() === 1 ? first : second).clone().endOf("isoWeek"),
        n,
      };
    },
  },
  {
    key: "month",
    name: "Month",
    group: "Calendar",
    span: "A calendar month",
    format: "YYYY-MM",
    examples: ["YYYY-MM", "MMMM YYYY", "YYYY/MM MMMM"],
    momentTokens: { M: "Month of the year, 1 to 12", MM: "M with two digits", MMM: "Short name", MMMM: "Name" },
    at: unit("month"),
  },
  {
    key: "quarter",
    name: "Quarter",
    group: "Calendar",
    span: "Three calendar months, from January, April, July and October",
    format: "YYYY-[Q]Q",
    examples: ["YYYY-[Q]Q", "[Q]Q YYYY", "Qo [quarter] YYYY"],
    momentTokens: { Q: "Quarter of the year, 1 to 4", Qo: "Q as an ordinal" },
    at: unit("quarter"),
  },
  {
    key: "half",
    name: "Half-year",
    group: "Calendar",
    span: "January to June, or July to December",
    format: "YYYY-[H]{{P}}",
    examples: ["YYYY-[H]{{P}}", "{{Po}} [half of] YYYY", "YYYY [H]{{P}}"],
    number: "Half of the year: 1 from January, 2 from July",
    at: (m) => {
      const start = m.clone().startOf("year").month(m.month() < 6 ? 0 : 6);
      return { start, end: start.clone().add(5, "months").endOf("month"), n: m.month() < 6 ? 1 : 2 };
    },
  },
  {
    key: "year",
    name: "Year",
    group: "Calendar",
    span: "A calendar year",
    format: "YYYY",
    examples: ["YYYY", "[Year ]YYYY"],
    momentTokens: { YYYY: "Year", YY: "Year with two digits" },
    at: unit("year"),
  },
  {
    key: "decade",
    name: "Decade",
    group: "Calendar",
    span: "Ten years, from a year ending in 0",
    format: "YYYY[s]",
    examples: ["YYYY[s]", "[The ]YY[s]", "YYYY-{{end:YYYY}}"],
    momentTokens: { "YYYY[s]": "First year, with an s", "YY[s]": "First year with two digits, with an s" },
    at: years(10, false),
  },
  {
    key: "century",
    name: "Century",
    group: "Calendar",
    span: "A hundred years: the 21st runs from 2001 to 2100",
    format: "{{Po}} [century]",
    examples: ["{{Po}} [century]", "[Century ]{{P}}", "YYYY-{{end:YYYY}}"],
    number: "Century, counted from year 1",
    at: years(100, true),
  },
  {
    key: "millennium",
    name: "Millennium",
    group: "Calendar",
    span: "A thousand years: the 3rd runs from 2001 to 3000",
    format: "{{Po}} [millennium]",
    examples: ["{{Po}} [millennium]", "[Millennium ]{{P}}"],
    number: "Millennium, counted from year 1",
    at: years(1000, true),
  },
  {
    key: "meteorological",
    name: "Meteorological season",
    group: "Seasons",
    span: "Three whole months: winter is December to February in the north",
    format: "{{PPPP}} YYYY{{end?:-YY}}",
    examples: ["{{PPPP}} YYYY{{end?:-YY}}", "{{PPPP}} YY{{end?:-YY}}", "{{PPPP}} YYYY{{end?:[ to ]YYYY}}", "{{PPP}} YY"],
    number: "Season of the year, 1 to 4, from March",
    labels: SEASON_LABELS,
    at: marks((y, ctx) =>
      ["03-01", "06-01", "09-01", "12-01"].map((md, i) => ({ date: `${pad(y)}-${md}`, n: i + 1, labels: season(i + 1, ctx) })),
    ),
  },
  {
    key: "astronomical",
    name: "Astronomical season",
    group: "Seasons",
    span: "From an equinox or solstice to the next",
    format: "{{PPPP}} YYYY{{end?:-YY}}",
    examples: ["{{PPPP}} YYYY{{end?:-YY}}", "{{PPPP:fall}} YYYY{{end?:-YYYY}}", "{{PPPP}} YY{{end?:-YY}}"],
    number: "Season of the year, 1 to 4, from the March equinox",
    labels: SEASON_LABELS,
    clock: "your time zone",
    at: marks((y, ctx) => sunSteps(y, 90, 0).map(({ at, index }) => ({ date: local(at), n: index + 1, labels: season(index + 1, ctx) }))),
  },
  {
    key: "wheel",
    name: "Wheel of the Year",
    noun: "festival of the Wheel of the Year",
    group: "Seasons",
    span: "Eight festivals: the solstices, the equinoxes, and the days between",
    format: "{{PPPP}} YYYY{{end?:-YY}}",
    examples: ["{{PPPP}} YYYY{{end?:-YY}}", "YYYY {{PPPP}}", "{{PP}} {{PPPP}} YYYY"],
    number: "Festival of the year, 1 to 8, from Samhain",
    labels: { PPPP: "Samhain, Yule, Imbolc, Ostara, Beltane, Litha, Lughnasadh or Mabon" },
    clock: "your time zone, for the solstices and equinoxes",
    at: marks((y, ctx) => {
      const [equinox, solstice, autumn, winter] = sunSteps(y, 90, 0).map(({ at }) => local(at));
      const dates = [`${pad(y)}-02-01`, equinox!, `${pad(y)}-05-01`, solstice!, `${pad(y)}-08-01`, autumn!, `${pad(y)}-11-01`, winter!];
      // In the north, February 1 is Imbolc; in the south, it's Lughnasadh.
      const first = ctx.hemisphere === "north" ? 2 : 6;
      return dates.map((date, i) => {
        const n = ((first + i) % 8) + 1;
        return { date, n, labels: { PPPP: FESTIVALS[n - 1]! } };
      });
    }),
  },
  {
    key: "fashion",
    name: "Fashion season",
    group: "Work",
    span: "Spring-summer and fall-winter, from dates you choose",
    format: "{{PPP}}YY",
    examples: ["{{PPP}}YY", "{{PPPP}} YYYY{{end?:-YY}}", "{{PPP:autumn}}YY", "YYYY {{PPP}}"],
    number: "1 for spring-summer, 2 for fall-winter",
    labels: {
      PPPP: "Spring-summer or Fall-winter",
      "PPPP:autumn": "Spring-summer or Autumn-winter",
      PPP: "SS or FW",
      "PPP:autumn": "SS or AW",
    },
    dates: [
      { key: "spring-summer", name: "Spring-summer starts", default: "02-01" },
      { key: "fall-winter", name: "Fall-winter starts", default: "08-01" },
    ],
    at: marks((y, ctx) => [
      {
        date: each("spring-summer")(y, ctx),
        n: 1,
        labels: { PPPP: "Spring-summer", "PPPP:autumn": "Spring-summer", PPP: "SS", "PPP:autumn": "SS" },
      },
      {
        date: each("fall-winter")(y, ctx),
        n: 2,
        labels: { PPPP: "Fall-winter", "PPPP:autumn": "Autumn-winter", PPP: "FW", "PPP:autumn": "AW" },
      },
    ]),
  },
  {
    key: "fiscal-year",
    name: "Fiscal year",
    group: "Work",
    span: "A year from the date you choose",
    format: "[FY]YYYY",
    examples: ["[FY]YYYY", "[FY]{{end:YYYY}}", "[FY]YYYY-{{end:YY}}"],
    dates: [{ key: "fiscal", name: "Starts", default: "04-01" }],
    at: marks((y, ctx) => [{ date: each("fiscal")(y, ctx), n: 1 }]),
  },
  {
    key: "fiscal-quarter",
    name: "Fiscal quarter",
    group: "Work",
    span: "Three months, from the start of the fiscal year",
    format: "[FY]{{fy:YYYY}} [Q]{{P}}",
    examples: ["[FY]{{fy:YYYY}} [Q]{{P}}", "[FY]{{fy:YY}}-[Q]{{P}}", "[FY]{{fy:YYYY}}-{{fyend:YY}} [Q]{{P}}"],
    number: "Quarter of the fiscal year, 1 to 4",
    dates: [{ key: "fiscal", name: "Fiscal year starts", default: "04-01" }],
    at: marks((y, ctx) => {
      const start = FISCAL(y, ctx);
      const year = { start, end: FISCAL(y + 1, ctx).subtract(1, "day").endOf("day") };
      return [0, 1, 2, 3].map((q) => ({ date: start.clone().add(q * 3, "months").format("YYYY-MM-DD"), n: q + 1, year }));
    }),
  },
  {
    key: "academic",
    name: "Academic year",
    group: "Work",
    span: "A school year, from the date you choose",
    format: "YYYY-{{end:YY}}",
    examples: ["YYYY-{{end:YY}}", "YYYY-{{end:YYYY}}", "[AY ]YY-{{end:YY}}"],
    dates: [{ key: "academic", name: "Starts", default: "09-01" }],
    at: marks((y, ctx) => [{ date: each("academic")(y, ctx), n: 1 }]),
  },
  {
    key: "sekki",
    name: "Sekki",
    group: "Japan",
    span: "The 24 sekki (二十四節気), about 15 days each, from Risshun in early February",
    format: "{{PPPP}} YYYY",
    examples: ["{{PPPP}} YYYY", "YYYY {{PPPP:kanji}}", "{{PPPP:english}} YYYY", "YYYY-{{PP}} {{PPPP}}"],
    number: "Sekki of the year, 1 to 24, from Risshun",
    labels: { PPPP: "Name in romaji", "PPPP:kanji": "Name in kanji", "PPPP:english": "Name in English" },
    clock: "Japan time",
    at: sun(15, 315, zoned(9), (n) => {
      const s = SEKKI[n - 1]!;
      return { PPPP: s.romaji, "PPPP:kanji": s.kanji, "PPPP:english": s.english };
    }),
  },
  {
    key: "ko",
    name: "Kō",
    group: "Japan",
    span: "The 72 kō (七十二候), about 5 days each, three in every sekki",
    format: "{{PPPP:english}} YYYY",
    examples: ["{{PPPP:english}} YYYY", "YYYY-{{PP}} {{PPPP:kanji}}", "{{PPPP}} YYYY", "{{PPPP:sekki}} {{P}}"],
    number: "Kō of the year, 1 to 72, from Risshun",
    labels: {
      PPPP: "Name in romaji",
      "PPPP:kanji": "Name in kanji",
      "PPPP:kana": "Name in kana",
      "PPPP:english": "Name in English",
      "PPPP:sekki": "Its sekki, in romaji",
    },
    clock: "Japan time",
    at: sun(5, 315, zoned(9), (n) => {
      const k = KO[n - 1]!;
      return {
        PPPP: k.romaji,
        "PPPP:kanji": k.kanji,
        "PPPP:kana": k.kana,
        "PPPP:english": k.english,
        "PPPP:sekki": SEKKI[Math.floor((n - 1) / 3)]!.romaji,
      };
    }),
  },
  {
    key: "jieqi",
    name: "Jiéqì",
    group: "China",
    span: "The 24 jiéqì (节气), about 15 days each, from Lìchūn in early February",
    format: "{{PPPP}} YYYY",
    examples: ["{{PPPP}} YYYY", "YYYY {{PPPP:hanzi}}", "{{PPPP:english}} YYYY"],
    number: "Jiéqì of the year, 1 to 24, from Lìchūn",
    labels: {
      PPPP: "Name in pinyin",
      "PPPP:hanzi": "Name in simplified characters",
      "PPPP:traditional": "Name in traditional characters",
      "PPPP:english": "Name in English",
    },
    clock: "China time (UTC+8)",
    at: sun(15, 315, zoned(8), (n) => {
      const j = JIEQI[n - 1]!;
      return { PPPP: j.pinyin, "PPPP:hanzi": j.simplified, "PPPP:traditional": j.traditional, "PPPP:english": j.english };
    }),
  },
  {
    key: "zodiac",
    name: "Zodiac year",
    group: "China",
    span: "From one Lunar New Year to the next, 1901 to 2100",
    format: "{{PPPP:element}} {{PPPP}} YYYY",
    examples: ["{{PPPP:element}} {{PPPP}} YYYY", "[Year of the ]{{PPPP}} YYYY", "YYYY {{PPPP:ganzhi}}"],
    number: "Animal of the cycle, 1 to 12, from the Rat",
    labels: {
      PPPP: "Animal",
      "PPPP:element": "Wood, Fire, Earth, Metal or Water",
      "PPPP:hanzi": "Animal in characters",
      "PPPP:ganzhi": "Stem and branch of the year",
    },
    at: marks((y) => {
      const i = y - LUNAR_NEW_YEAR_FROM;
      const doy = LUNAR_NEW_YEAR[i];
      if (doy === undefined) return [];
      const cycle = (((y - 4) % 60) + 60) % 60;
      const animal = cycle % 12;
      return [
        {
          date: `${pad(y)}-${doy > 31 ? "02" : "01"}-${String(doy > 31 ? doy - 31 : doy).padStart(2, "0")}`,
          n: animal + 1,
          labels: {
            PPPP: ANIMALS[animal]!,
            "PPPP:element": ELEMENTS[Math.floor((cycle % 10) / 2)]!,
            "PPPP:hanzi": ANIMALS_HANZI[animal]!,
            "PPPP:ganzhi": STEMS[cycle % 10]! + BRANCHES[animal]!,
          },
        },
      ];
    }),
  },
  {
    key: "jeolgi",
    name: "Jeolgi",
    group: "Korea",
    span: "The 24 jeolgi (절기), about 15 days each, from Ipchun in early February",
    format: "{{PPPP}} YYYY",
    examples: ["{{PPPP}} YYYY", "YYYY {{PPPP:hangul}}", "{{PPPP:english}} YYYY"],
    number: "Jeolgi of the year, 1 to 24, from Ipchun",
    labels: { PPPP: "Name, romanized", "PPPP:hangul": "Name in Hangul", "PPPP:english": "Name in English" },
    clock: "Korea time (UTC+9)",
    at: sun(15, 315, zoned(9), (n) => {
      const j = JEOLGI[n - 1]!;
      return { PPPP: j.romanized, "PPPP:hangul": j.hangul, "PPPP:english": j.english };
    }),
  },
  {
    key: "ritu",
    name: "Ṛtu",
    group: "India",
    span: "Six seasons of about two months, from Vasanta in mid-February. Śiśira starts at the winter solstice",
    format: "{{PPPP}} YYYY{{end?:-YY}}",
    examples: ["{{PPPP}} YYYY{{end?:-YY}}", "YYYY {{PPPP:devanagari}}", "{{PPPP:english}} YYYY{{end?:-YY}}"],
    number: "Ṛtu of the year, 1 to 6, from Vasanta",
    labels: {
      PPPP: "Name, with diacritics",
      "PPPP:plain": "Name, without diacritics",
      "PPPP:devanagari": "Name in Devanagari",
      "PPPP:english": "Name in English",
    },
    clock: "India time (UTC+5:30)",
    at: sun(60, 330, zoned(5.5), (n) => {
      const r = RITU[n - 1]!;
      return { PPPP: r.iast, "PPPP:plain": r.plain, "PPPP:devanagari": r.devanagari, "PPPP:english": r.english };
    }),
  },
];

export const GROUPS: Group[] = ["Calendar", "Seasons", "Work", "Japan", "China", "Korea", "India"];

// What commands call a period: "Open next week".
export const noun = (period: Period) => period.noun ?? period.name.toLowerCase();

// The occurrence after or before one: the period around the day after it
// ends, or the day before it starts.
export const next = (period: Period, ctx: Context, instance: Instance) =>
  period.at(instance.end.clone().add(1, "day").startOf("day"), ctx);
export const previous = (period: Period, ctx: Context, instance: Instance) =>
  period.at(instance.start.clone().subtract(1, "day"), ctx);
