import type { Moment } from "moment";
import { App, moment, normalizePath, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

// Obsidian's typings export moment as a namespace; at runtime it is the moment function.
const today = moment as unknown as () => Moment;

const DAY = "YYYY-MM-DD";

type Unit = "isoWeek" | "quarter" | "year";
type Key = "week" | "quarter" | "year";

interface Settings {
  folder: string;
  templates: Record<Key, string>;
}

const DEFAULTS: Settings = {
  folder: "Calendar",
  templates: {
    week: "Templates/Year-Week template.md",
    quarter: "Templates/Year-Quarter template.md",
    year: "Templates/Year template.md",
  },
};

const PERIODS: { key: Key; name: string; unit: Unit; format: string }[] = [
  { key: "week", name: "week", unit: "isoWeek", format: "GGGG-[W]WW" },
  { key: "quarter", name: "quarter", unit: "quarter", format: "YYYY-[Q]Q" },
  { key: "year", name: "year", unit: "year", format: "YYYY" },
];

export default class Zhami extends Plugin {
  settings: Settings = structuredClone(DEFAULTS);

  async onload() {
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = {
      folder: saved?.folder ?? DEFAULTS.folder,
      templates: { ...DEFAULTS.templates, ...saved?.templates },
    };

    for (const period of PERIODS) {
      this.addCommand({
        id: `open-${period.key}`,
        name: `Open this ${period.name}`,
        callback: () => this.open(period),
      });
    }
    this.addSettingTab(new ZhamiSettings(this.app, this));
  }

  async open(period: (typeof PERIODS)[number]) {
    const { vault, workspace } = this.app;
    const now = today();
    const title = now.format(period.format);
    const folder = normalizePath(this.settings.folder || "/");
    const path = normalizePath(`${folder}/${title}.md`);

    let file = vault.getFileByPath(path);
    if (!file) {
      if (folder !== "/" && !vault.getFolderByPath(folder)) await vault.createFolder(folder);
      const templatePath = this.settings.templates[period.key];
      const template = templatePath ? vault.getFileByPath(normalizePath(templatePath)) : null;
      if (templatePath && !template) new Notice(`Zhami: template not found: ${templatePath}`);
      const text = template ? fill(await vault.read(template), title, now, period.unit) : "";
      file = await vault.create(path, text);
    }
    await workspace.getLeaf(false).openFile(file);
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
      .setDesc("Where new notes are created.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULTS.folder)
          .setValue(settings.folder)
          .onChange((value) => {
            settings.folder = value.trim();
            void save();
          }),
      );

    for (const period of PERIODS) {
      new Setting(containerEl)
        .setName(`${period.name[0].toUpperCase()}${period.name.slice(1)} template`)
        .setDesc("Path to the template file. Leave empty for a blank note.")
        .addText((text) =>
          text
            .setPlaceholder(DEFAULTS.templates[period.key])
            .setValue(settings.templates[period.key])
            .onChange((value) => {
              settings.templates[period.key] = value.trim();
              void save();
            }),
        );
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
