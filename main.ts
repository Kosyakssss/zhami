import type { Moment } from "moment";
import {
  AbstractInputSuggest,
  addIcon,
  App,
  moment,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
} from "obsidian";

// Obsidian's typings export moment as a namespace; at runtime it is the moment function.
const today = moment as unknown as () => Moment;

const DAY = "YYYY-MM-DD";

// ჟ, the first letter of ჟამი, drawn on Lucide's 24px grid. Stroke width
// is left to Obsidian, so it matches the built-in icons. Also in icon.svg.
const ICON = "zhami";
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3v13a5 5 0 0 1-10 0"/><path d="M17 3 7 6"/><path d="M9.5 8.3c1.9.2 3 1 3 2 0 1.3-1.5 2.1-3.4 2.1-.9 0-1.6-.1-2.1-.3"/></svg>`;

type Key = "week" | "fortnight" | "month" | "quarter" | "half" | "year" | "decade" | "century" | "millennium";

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
function unit(key: Key, name: string, format: string, u: "isoWeek" | "month" | "quarter" | "year", n: (m: Moment) => number): Period {
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

const PERIODS: Period[] = [
  unit("week", "Week", "GGGG-[W]WW", "isoWeek", (m) => m.isoWeek()),
  {
    // Pairs of ISO weeks: weeks 1 and 2 are the first fortnight. In a year
    // with 53 weeks, the 27th fortnight is one week long.
    key: "fortnight",
    name: "Fortnight",
    format: "GGGG-[F]{n}",
    n: (m) => Math.ceil(m.isoWeek() / 2),
    start: (m) => m.clone().isoWeek(Math.ceil(m.isoWeek() / 2) * 2 - 1).startOf("isoWeek"),
    end: (m) => {
      const first = m.clone().isoWeek(Math.ceil(m.isoWeek() / 2) * 2 - 1);
      const second = first.clone().add(1, "week");
      return (second.isoWeek() === 1 ? first : second).endOf("isoWeek");
    },
  },
  unit("month", "Month", "YYYY-MM", "month", (m) => m.month() + 1),
  unit("quarter", "Quarter", "YYYY-[Q]Q", "quarter", (m) => m.quarter()),
  {
    key: "half",
    name: "Half-year",
    format: "YYYY-[H]{n}",
    n: (m) => (m.month() < 6 ? 1 : 2),
    start: (m) => m.clone().startOf("year").month(m.month() < 6 ? 0 : 6),
    end: (m) => m.clone().startOf("year").month(m.month() < 6 ? 5 : 11).endOf("month"),
  },
  unit("year", "Year", "YYYY", "year", (m) => m.year()),
  years("decade", "Decade", "{n}[s]", 10, false),
  years("century", "Century", "{nth}[ century]", 100, true),
  years("millennium", "Millennium", "{nth}[ millennium]", 1000, true),
];

const keys = <T>(value: (p: Period) => T) =>
  Object.fromEntries(PERIODS.map((p) => [p.key, value(p)])) as Record<Key, T>;

interface Settings {
  folder: string;
  enabled: Record<Key, boolean>;
  formats: Record<Key, string>;
  templates: Record<Key, string>;
}

const DEFAULTS: Settings = {
  folder: "",
  enabled: keys((p) => ["week", "month", "quarter", "year"].includes(p.key)),
  formats: keys((p) => p.format),
  templates: keys(() => ""),
};

function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens > 10 && tens < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// Moment formats, plus {n} and {nth}: the period's number, like 23 or 23rd.
function name(period: Period, format: string, now: Moment) {
  const n = period.n(now);
  const escaped = format.replace(/{nth}/g, `[${ordinal(n)}]`).replace(/{n}/g, `[${n}]`);
  return period.start(now).format(escaped);
}

export default class Zhami extends Plugin {
  settings: Settings = structuredClone(DEFAULTS);

  async onload() {
    addIcon(ICON, ICON_SVG);
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = {
      folder: saved?.folder ?? DEFAULTS.folder,
      enabled: { ...DEFAULTS.enabled, ...saved?.enabled },
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
      this.addCommand({
        id,
        name: `Open this ${period.name.toLowerCase()}`,
        icon: ICON,
        callback: () => this.open(period),
      });
    } else {
      this.removeCommand(id);
    }
  }

  async open(period: Period) {
    const { vault, workspace } = this.app;
    const now = today();
    const title = name(period, this.settings.formats[period.key] || period.format, now);
    const path = normalizePath(`${this.settings.folder || "/"}/${title}.md`);

    let file = vault.getFileByPath(path);
    if (!file) {
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      const templatePath = this.settings.templates[period.key];
      const template = templatePath ? vault.getFileByPath(normalizePath(templatePath.replace(/(\.md)?$/, ".md"))) : null;
      if (templatePath && !template) new Notice(`Zhami: template not found: ${templatePath}`);
      const text = template ? fill(await vault.read(template), title.split("/").pop()!, now, period) : "";
      file = await vault.create(path, text);
    }
    await workspace.getLeaf(false).openFile(file);
  }

  // A format with slashes, like YYYY/[W]WW, puts notes in subfolders.
  async ensureFolder(path: string) {
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getFolderByPath(current)) await this.app.vault.createFolder(current);
    }
  }
}

class PathSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private input: HTMLInputElement,
    private kind: "folder" | "note",
  ) {
    super(app, input);
  }

  getSuggestions(query: string) {
    const q = query.toLowerCase();
    const paths =
      this.kind === "folder"
        ? this.app.vault
            .getAllLoadedFiles()
            .filter((f) => f instanceof TFolder && !f.isRoot())
            .map((f) => f.path)
        : this.app.vault.getMarkdownFiles().map((f) => f.path);
    return paths.filter((p) => p.toLowerCase().includes(q)).sort();
  }

  renderSuggestion(path: string, el: HTMLElement) {
    el.setText(path);
  }

  selectSuggestion(path: string) {
    this.setValue(path);
    this.input.dispatchEvent(new Event("input"));
    this.close();
  }
}

class ZhamiSettings extends PluginSettingTab {
  icon = ICON;

  constructor(
    app: App,
    private plugin: Zhami,
  ) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    const { settings } = this.plugin;
    const save = () => this.plugin.saveData(settings);
    containerEl.empty();

    new Setting(containerEl)
      .setName("Folder")
      .setDesc("New notes go here.")
      .addSearch((search) => {
        new PathSuggest(this.app, search.inputEl, "folder");
        search
          .setPlaceholder("Vault root")
          .setValue(settings.folder)
          .onChange((value) => {
            settings.folder = value.trim();
            void save();
          });
      });

    for (const period of PERIODS) {
      new Setting(containerEl)
        .setName(period.name)
        .setHeading()
        .addToggle((toggle) =>
          toggle.setValue(settings.enabled[period.key]).onChange((value) => {
            settings.enabled[period.key] = value;
            this.plugin.toggleCommand(period);
            void save();
            this.display();
          }),
        );
      if (!settings.enabled[period.key]) continue;

      const format = new Setting(containerEl).setName("Name format");
      const sample = createSpan({ cls: "u-pop" });
      const update = (value: string) => sample.setText(name(period, value || period.format, today()));
      format.descEl.append("Your current syntax looks like this: ", sample, ". ");
      if (period.format.includes("{n")) format.descEl.append("{n} is its number, {nth} is 1st, 2nd, and so on. ");
      format.descEl.createEl("a", {
        text: "Format reference",
        href: "https://momentjs.com/docs/#/displaying/format/",
      });
      format.addText((text) =>
        text
          .setPlaceholder(period.format)
          .setValue(settings.formats[period.key])
          .onChange((value) => {
            settings.formats[period.key] = value.trim();
            update(value.trim());
            void save();
          }),
      );
      update(settings.formats[period.key]);

      new Setting(containerEl)
        .setName("Template")
        .setDesc("Leave empty for a blank note.")
        .addSearch((search) => {
          new PathSuggest(this.app, search.inputEl, "note");
          search
            .setPlaceholder(`Example: Templates/${period.name}`)
            .setValue(settings.templates[period.key])
            .onChange((value) => {
              settings.templates[period.key] = value.trim();
              void save();
            });
        });
    }
  }
}

// Same variables as the core Templates plugin, plus {{start}} and {{end}}:
// the first and last day of the period.
function fill(text: string, title: string, now: Moment, period: Period) {
  return text.replace(/{{\s*(title|date|time|start|end)\s*(?::([^}]+))?}}/gi, (_, key: string, format?: string) => {
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
      default:
        return now.format(f || DAY);
    }
  });
}
