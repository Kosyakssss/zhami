import type { Moment } from "moment";
import {
  AbstractInputSuggest,
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

type Unit = "isoWeek" | "quarter" | "year";
type Key = "week" | "quarter" | "year";

interface Settings {
  folder: string;
  formats: Record<Key, string>;
  templates: Record<Key, string>;
}

const DEFAULTS: Settings = {
  folder: "",
  formats: {
    week: "GGGG-[W]WW",
    quarter: "YYYY-[Q]Q",
    year: "YYYY",
  },
  templates: {
    week: "",
    quarter: "",
    year: "",
  },
};

const PERIODS: { key: Key; name: string; unit: Unit }[] = [
  { key: "week", name: "Week", unit: "isoWeek" },
  { key: "quarter", name: "Quarter", unit: "quarter" },
  { key: "year", name: "Year", unit: "year" },
];

export default class Zhami extends Plugin {
  settings: Settings = structuredClone(DEFAULTS);

  async onload() {
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = {
      folder: saved?.folder ?? DEFAULTS.folder,
      formats: { ...DEFAULTS.formats, ...saved?.formats },
      templates: { ...DEFAULTS.templates, ...saved?.templates },
    };

    for (const period of PERIODS) {
      this.addCommand({
        id: `open-${period.key}`,
        name: `Open this ${period.name.toLowerCase()}`,
        callback: () => this.open(period),
      });
    }
    this.addSettingTab(new ZhamiSettings(this.app, this));
  }

  async open(period: (typeof PERIODS)[number]) {
    const { vault, workspace } = this.app;
    const now = today();
    const title = now.format(this.settings.formats[period.key] || DEFAULTS.formats[period.key]);
    const path = normalizePath(`${this.settings.folder || "/"}/${title}.md`);

    let file = vault.getFileByPath(path);
    if (!file) {
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      const templatePath = this.settings.templates[period.key];
      const template = templatePath ? vault.getFileByPath(normalizePath(templatePath.replace(/(\.md)?$/, ".md"))) : null;
      if (templatePath && !template) new Notice(`Zhami: template not found: ${templatePath}`);
      const text = template ? fill(await vault.read(template), title.split("/").pop()!, now, period.unit) : "";
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
      new Setting(containerEl).setName(period.name).setHeading();

      const format = new Setting(containerEl).setName("Name format");
      const sample = createSpan({ cls: "u-pop" });
      format.descEl.append("Your current syntax looks like this: ", sample, ". ");
      format.descEl.createEl("a", {
        text: "Format reference",
        href: "https://momentjs.com/docs/#/displaying/format/",
      });
      format.addMomentFormat((field) =>
        field
          .setDefaultFormat(DEFAULTS.formats[period.key])
          .setValue(settings.formats[period.key])
          .setSampleEl(sample)
          .onChange((value) => {
            settings.formats[period.key] = value.trim();
            void save();
          }),
      );

      new Setting(containerEl)
        .setName("Template")
        .setDesc("Leave empty for a blank note.")
        .addSearch((search) => {
          new PathSuggest(this.app, search.inputEl, "note");
          search
            .setPlaceholder("Example: Templates/Week")
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
function fill(text: string, title: string, now: Moment, unit: Unit) {
  return text.replace(/{{\s*(title|date|time|start|end)\s*(?::([^}]+))?}}/gi, (_, key: string, format?: string) => {
    const f = format?.trim();
    switch (key.toLowerCase()) {
      case "title":
        return title;
      case "time":
        return now.format(f || "HH:mm");
      case "start":
        return now.clone().startOf(unit).format(f || DAY);
      case "end":
        return now.clone().endOf(unit).format(f || DAY);
      default:
        return now.format(f || DAY);
    }
  });
}
