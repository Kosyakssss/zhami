import type { Moment } from "moment";
import {
  addIcon,
  App,
  moment,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  type SettingDefinitionItem,
  type TFile,
} from "obsidian";

// Obsidian's typings export moment as a namespace; at runtime it is the moment function.
const today = moment as unknown as () => Moment;

const DAY = "YYYY-MM-DD";

// ჟ, the first letter of ჟამი, from Noto Sans Georgian (SIL Open Font
// License 1.1) at weight 600, on Obsidian's 100-unit icon grid. Also in icon.svg.
const ICON = "zhami";
const ICON_SVG = `<path fill="currentColor" stroke="none" d="M51.8 91.7Q45.9 91.7 41.2 90Q36.4 88.3 33.1 85.3Q29.7 82.3 27.9 78.2Q26.1 74.2 26.1 69.5Q26.1 66.2 26.6 64Q27 61.9 27.9 59.9L40.5 59.9Q40 61.9 39.7 63.8Q39.5 65.7 39.5 68Q39.5 71.5 40.8 74.5Q42.1 77.5 44.8 79.4Q47.6 81.2 51.8 81.2Q56.4 81.2 59.1 79.2Q61.8 77.1 63 73.3Q64.2 69.4 64.2 64.2L64.2 18.4Q60.9 19.8 57.1 20.8Q53.3 21.8 49.2 22.4L49.2 22.7Q52 24.1 53.8 26.9Q55.6 29.8 55.6 33.6Q55.6 37.8 53.5 41.1Q51.4 44.4 47.6 46.3Q43.8 48.2 38.8 48.2Q31.6 48.2 27 44.3Q22.5 40.3 22.5 34.3Q22.5 33.3 22.6 32.3Q22.7 31.3 23 30.4L33.1 30.4Q33 31.1 32.9 31.7Q32.8 32.3 32.8 32.8Q32.8 35.6 34.4 37.3Q36 39 38.7 39Q41.7 39 43.3 37.1Q44.9 35.2 44.9 32.4Q44.9 28.8 43.1 26.8Q41.4 24.8 38.1 24.4L38.1 15.2Q45.7 14.4 52.9 12.7Q60.1 11.1 65.9 8.3L77.5 8.3L77.5 64.3Q77.5 72.9 74.5 79.1Q71.5 85.2 65.8 88.4Q60 91.7 51.8 91.7Z"/>`;

type Key =
  | "week"
  | "fortnight"
  | "month"
  | "season"
  | "quarter"
  | "half"
  | "year"
  | "decade"
  | "century"
  | "millennium";

type Hemisphere = "north" | "south";

interface Period {
  key: Key;
  name: string;
  format: string;
  // The first moment of the period that contains `m`, its last moment, and its number.
  start(m: Moment): Moment;
  end(m: Moment): Moment;
  n(m: Moment): number;
}

// Periods moment knows natively.
function unit(
  key: Key,
  name: string,
  format: string,
  u: "isoWeek" | "month" | "quarter" | "year",
  n: (m: Moment) => number,
): Period {
  return { key, name, format, n, start: (m) => m.clone().startOf(u), end: (m) => m.clone().endOf(u) };
}

// Spans of years. Decades start at 2020; centuries and millennia are ordinal,
// so the 21st century runs from 2001 to 2100.
function years(key: Key, name: string, format: string, span: number, ordinal: boolean): Period {
  const first = (m: Moment) => (ordinal ? Math.floor((m.year() - 1) / span) * span + 1 : m.year() - (m.year() % span));
  const start = (m: Moment) => m.clone().year(first(m)).startOf("year");
  return {
    key,
    name,
    format,
    start,
    end: (m) => start(m).add(span - 1, "years").endOf("year"),
    n: (m) => (ordinal ? Math.ceil(m.year() / span) : first(m)),
  };
}

// Meteorological seasons: whole months, spring from March in the north.
// Winter starts in December, so it takes the year it starts in.
const SEASONS: Record<Hemisphere, string[]> = {
  north: ["Winter", "Spring", "Summer", "Autumn"],
  south: ["Summer", "Autumn", "Winter", "Spring"],
};
const seasonIndex = (m: Moment) => Math.floor(((m.month() + 1) % 12) / 3);
const seasonStart = (m: Moment) =>
  m.clone().startOf("month").subtract((m.month() + 1) % 3, "months");

const PERIODS: Period[] = [
  unit("week", "Week", "GGGG-[W]WW", "isoWeek", (m) => m.isoWeek()),
  {
    // Pairs of ISO weeks: weeks 1 and 2 are the first fortnight. In a year
    // with 53 weeks, the 27th fortnight is one week long.
    key: "fortnight",
    name: "Fortnight",
    format: "GGGG-[F]{{n}}",
    n: (m) => Math.ceil(m.isoWeek() / 2),
    start: (m) => m.clone().isoWeek(Math.ceil(m.isoWeek() / 2) * 2 - 1).startOf("isoWeek"),
    end: (m) => {
      const first = m.clone().isoWeek(Math.ceil(m.isoWeek() / 2) * 2 - 1);
      const second = first.clone().add(1, "week");
      return (second.isoWeek() === 1 ? first : second).endOf("isoWeek");
    },
  },
  unit("month", "Month", "YYYY-MM", "month", (m) => m.month() + 1),
  {
    // Numbered by start month: March is 1, December is 4.
    key: "season",
    name: "Season",
    format: "{{season}} YYYY",
    n: (m) => seasonIndex(m) || 4,
    start: seasonStart,
    end: (m) => seasonStart(m).add(2, "months").endOf("month"),
  },
  unit("quarter", "Quarter", "YYYY-[Q]Q", "quarter", (m) => m.quarter()),
  {
    key: "half",
    name: "Half-year",
    format: "YYYY-[H]{{n}}",
    n: (m) => (m.month() < 6 ? 1 : 2),
    start: (m) => m.clone().startOf("year").month(m.month() < 6 ? 0 : 6),
    end: (m) => m.clone().startOf("year").month(m.month() < 6 ? 5 : 11).endOf("month"),
  },
  unit("year", "Year", "YYYY", "year", (m) => m.year()),
  years("decade", "Decade", "{{n}}[s]", 10, false),
  years("century", "Century", "{{nth}} [century]", 100, true),
  years("millennium", "Millennium", "{{nth}} [millennium]", 1000, true),
];

const keys = <T>(value: (p: Period) => T) =>
  Object.fromEntries(PERIODS.map((p) => [p.key, value(p)])) as Record<Key, T>;

interface Settings {
  folder: string;
  hemisphere: Hemisphere;
  enabled: Record<Key, boolean>;
  folders: Record<Key, string>;
  formats: Record<Key, string>;
  templates: Record<Key, string>;
}

const DEFAULTS: Settings = {
  folder: "",
  hemisphere: "north",
  enabled: keys((p) => ["week", "month", "quarter", "year"].includes(p.key)),
  folders: keys(() => ""),
  formats: keys((p) => p.format),
  templates: keys(() => ""),
};

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens > 10 && tens < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// {{n}}, {{nth}} and {{season}}, shared by name formats and templates.
function variables(period: Period, now: Moment, hemisphere: Hemisphere): Record<string, string> {
  const n = period.n(now);
  return { n: `${n}`, nth: ordinal(n), season: SEASONS[hemisphere][seasonIndex(now)]! };
}

export default class Zhami extends Plugin {
  settings: Settings = structuredClone(DEFAULTS);

  async onload() {
    addIcon(ICON, ICON_SVG);
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = {
      folder: saved?.folder ?? DEFAULTS.folder,
      hemisphere: saved?.hemisphere ?? DEFAULTS.hemisphere,
      enabled: { ...DEFAULTS.enabled, ...saved?.enabled },
      folders: { ...DEFAULTS.folders, ...saved?.folders },
      formats: { ...DEFAULTS.formats, ...saved?.formats },
      templates: { ...DEFAULTS.templates, ...saved?.templates },
    };
    for (const period of PERIODS) this.toggleCommand(period);
    this.addSettingTab(new ZhamiSettings(this.app, this));
  }

  // Only enabled periods get a command, so the command palette stays short.
  toggleCommand(period: Period) {
    const id = `open-${period.key}`;
    if (this.settings.enabled[period.key]) {
      this.addCommand({ id, name: commandName(period), icon: ICON, callback: () => this.open(period) });
    } else {
      this.removeCommand(id);
    }
  }

  // The note's path for the period around `now`. Moment formats, applied to
  // the period's first day, plus {{n}}, {{nth}} and {{season}}. A format with
  // slashes, like YYYY/[W]WW, puts notes in subfolders.
  path(period: Period, now: Moment, format = this.settings.formats[period.key]) {
    const vars = variables(period, now, this.settings.hemisphere);
    const escaped = (format || period.format).replace(/{{\s*(n|nth|season)\s*}}/gi, (_, k: string) => `[${vars[k.toLowerCase()]}]`);
    const folder = this.settings.folders[period.key] || this.settings.folder || "/";
    return normalizePath(`${folder}/${period.start(now).format(escaped)}`);
  }

  async open(period: Period) {
    const { vault, workspace } = this.app;
    const now = today();
    const path = `${this.path(period, now)}.md`;

    let file = vault.getFileByPath(path);
    if (!file) {
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      const templatePath = this.settings.templates[period.key];
      const template = templatePath ? vault.getFileByPath(normalizePath(templatePath.replace(/(\.md)?$/, ".md"))) : null;
      if (templatePath && !template) new Notice(`Zhami: template not found: ${templatePath}`);
      const title = path.split("/").pop()!.slice(0, -3);
      const text = template ? this.fill(await vault.read(template), title, now, period) : "";
      file = await vault.create(path, text);
    }
    await workspace.getLeaf(false).openFile(file);
  }

  async ensureFolder(path: string) {
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getFolderByPath(current)) await this.app.vault.createFolder(current);
    }
  }

  // Same variables as the core Templates plugin, plus {{start}}, {{end}},
  // {{n}}, {{nth}} and {{season}}.
  fill(text: string, title: string, now: Moment, period: Period) {
    const vars = variables(period, now, this.settings.hemisphere);
    return text.replace(
      /{{\s*(title|date|time|start|end|n|nth|season)\s*(?::([^}]+))?}}/gi,
      (_, key: string, format?: string) => {
        const f = format?.trim();
        switch (key.toLowerCase()) {
          case "title":
            return title;
          case "time":
            return now.format(f || "HH:mm");
          case "start":
            return period.start(now).format(f || DAY);
          case "end":
            return period.end(now).format(f || DAY);
          case "date":
            return now.format(f || DAY);
          default:
            return vars[key.toLowerCase()]!;
        }
      },
    );
  }
}

const commandName = (period: Period) => `Open this ${period.name.toLowerCase()}`;

// Settings are declarative: a default folder, then one page per period.
// Control keys are paths into the settings object, like "formats.week".
class ZhamiSettings extends PluginSettingTab {
  icon = ICON;

  constructor(
    app: App,
    private plugin: Zhami,
  ) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return key.split(".").reduce<any>((value, part) => value?.[part], this.plugin.settings);
  }

  async setControlValue(key: string, value: unknown) {
    const parts = key.split(".");
    const last = parts.pop()!;
    const target = parts.reduce<any>((object, part) => object[part], this.plugin.settings);
    target[last] = typeof value === "string" ? value.trim() : value;
    await this.plugin.saveData(this.plugin.settings);

    const period = PERIODS.find((p) => p.key === last);
    if (parts[0] === "enabled" && period) this.plugin.toggleCommand(period);
    this.refreshDomState();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const { settings } = this.plugin;
    const on = (period: Period) => () => settings.enabled[period.key];

    return [
      {
        type: "group",
        items: [
          {
            name: "Folder",
            desc: "New notes go here, unless a period has its own folder.",
            control: { type: "folder", key: "folder", placeholder: "Vault root" },
          },
        ],
      },
      {
        type: "group",
        heading: "Periods",
        items: PERIODS.map((period) => ({
          type: "page" as const,
          name: period.name,
          displayValue: () => (settings.enabled[period.key] ? this.plugin.path(period, today()) : "Off"),
          items: [
            {
              type: "group" as const,
              items: [
                {
                  name: commandName(period),
                  desc: "Adds this command.",
                  control: { type: "toggle" as const, key: `enabled.${period.key}` },
                },
              ],
            },
            {
              type: "group" as const,
              visible: on(period),
              items: [
                {
                  name: "Folder",
                  desc: "Leave empty to use the default folder.",
                  control: {
                    type: "folder" as const,
                    key: `folders.${period.key}`,
                    placeholder: settings.folder || "Vault root",
                  },
                },
                {
                  name: "Name format",
                  render: (setting) => {
                    const sample = createSpan({ cls: "u-pop" });
                    const update = (value: string) => sample.setText(this.plugin.path(period, today(), value));
                    const desc = createFragment((f) => {
                      f.append("New notes go to ", sample, ". ");
                      f.createEl("a", { text: "Format reference", href: "https://momentjs.com/docs/#/displaying/format/" });
                    });
                    setting.setDesc(desc).addText((text) =>
                      text
                        .setPlaceholder(period.format)
                        .setValue(settings.formats[period.key])
                        .onChange(async (value) => {
                          update(value.trim());
                          await this.setControlValue(`formats.${period.key}`, value);
                        }),
                    );
                    update(settings.formats[period.key]);
                  },
                },
                ...(period.key === "season"
                  ? [
                      {
                        name: "Hemisphere",
                        desc: "Seasons are flipped in the south.",
                        control: {
                          type: "dropdown" as const,
                          key: "hemisphere",
                          options: { north: "Northern", south: "Southern" },
                        },
                      },
                    ]
                  : []),
                {
                  name: "Template",
                  desc: "Leave empty for a blank note.",
                  control: {
                    type: "file" as const,
                    key: `templates.${period.key}`,
                    placeholder: `Example: Templates/${period.name}.md`,
                    filter: (file: TFile) => file.extension === "md",
                  },
                },
              ],
            },
          ],
        })),
      },
    ];
  }
}
