import {
  AbstractInputSuggest,
  addIcon,
  App,
  moment as obsidianMoment,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingPage,
  TFolder,
  type SettingDefinitionItem,
  type TFile,
} from "obsidian";
import { fill, reference, render } from "./src/format";
import { moment, useMoment } from "./src/moment";
import { GROUPS, PERIODS, type Context, type Instance, type Period } from "./src/periods";
import { instances, plan } from "./src/rename";
import { DEFAULTS, load, tidy, type Settings } from "./src/settings";

// ჟ, the first letter of ჟამი, from Noto Sans Georgian (SIL Open Font
// License 1.1) at weight 600, on Obsidian's 100-unit icon grid. Also in icon.svg.
const ICON = "zhami";
const ICON_SVG = `<path fill="currentColor" stroke="none" d="M51.8 91.7Q45.9 91.7 41.2 90Q36.4 88.3 33.1 85.3Q29.7 82.3 27.9 78.2Q26.1 74.2 26.1 69.5Q26.1 66.2 26.6 64Q27 61.9 27.9 59.9L40.5 59.9Q40 61.9 39.7 63.8Q39.5 65.7 39.5 68Q39.5 71.5 40.8 74.5Q42.1 77.5 44.8 79.4Q47.6 81.2 51.8 81.2Q56.4 81.2 59.1 79.2Q61.8 77.1 63 73.3Q64.2 69.4 64.2 64.2L64.2 18.4Q60.9 19.8 57.1 20.8Q53.3 21.8 49.2 22.4L49.2 22.7Q52 24.1 53.8 26.9Q55.6 29.8 55.6 33.6Q55.6 37.8 53.5 41.1Q51.4 44.4 47.6 46.3Q43.8 48.2 38.8 48.2Q31.6 48.2 27 44.3Q22.5 40.3 22.5 34.3Q22.5 33.3 22.6 32.3Q22.7 31.3 23 30.4L33.1 30.4Q33 31.1 32.9 31.7Q32.8 32.3 32.8 32.8Q32.8 35.6 34.4 37.3Q36 39 38.7 39Q41.7 39 43.3 37.1Q44.9 35.2 44.9 32.4Q44.9 28.8 43.1 26.8Q41.4 24.8 38.1 24.4L38.1 15.2Q45.7 14.4 52.9 12.7Q60.1 11.1 65.9 8.3L77.5 8.3L77.5 64.3Q77.5 72.9 74.5 79.1Q71.5 85.2 65.8 88.4Q60 91.7 51.8 91.7Z"/>`;

export default class Zhami extends Plugin {
  settings: Settings = structuredClone(DEFAULTS);

  async onload() {
    useMoment(obsidianMoment);
    addIcon(ICON, ICON_SVG);
    this.settings = load(await this.loadData());
    await this.saveSettings();
    for (const period of PERIODS) this.toggleCommand(period);
    this.addSettingTab(new ZhamiSettings(this.app, this));
  }

  async saveSettings() {
    await this.saveData(tidy(this.settings));
  }

  get context(): Context {
    return { hemisphere: this.settings.hemisphere, dates: this.settings.dates };
  }

  // Only enabled periods get a command, so the command palette stays short.
  toggleCommand(period: Period) {
    const id = `open-${period.key}`;
    if (this.settings.enabled[period.key]) {
      this.addCommand({ id, name: commandName(period), icon: ICON, callback: () => void this.open(period) });
    } else {
      this.removeCommand(id);
    }
  }

  folder(period: Period) {
    return this.settings.folders[period.key] || this.settings.folder;
  }

  format(period: Period) {
    return this.settings.formats[period.key] || period.format;
  }

  instance(period: Period, m = moment()) {
    return period.at(m, this.context);
  }

  // The note's path, without .md.
  path(period: Period, instance = this.instance(period), format = this.format(period)) {
    const rendered = render(format, period, instance);
    return { path: normalizePath(`${this.folder(period) || "/"}/${rendered.text}`), errors: rendered.errors };
  }

  async open(period: Period) {
    const { vault, workspace } = this.app;
    let instance: Instance;
    try {
      instance = this.instance(period);
    } catch (e) {
      new Notice(`Zhami: ${(e as Error).message.replace(/^Zhami: /, "")}`);
      return;
    }
    const { path: name, errors } = this.path(period, instance);
    if (errors.length) {
      new Notice(`Zhami: ${errors[0]}. Check the name format in settings.`);
      return;
    }
    const path = `${name}.md`;
    let file = vault.getFileByPath(path);
    if (!file) {
      await this.ensureFolder(path.split("/").slice(0, -1).join("/"));
      const templatePath = this.settings.templates[period.key];
      const template = templatePath ? vault.getFileByPath(normalizePath(templatePath.replace(/(\.md)?$/, ".md"))) : null;
      if (templatePath && !template) new Notice(`Zhami: template not found: ${templatePath}`);
      const title = path.split("/").pop()!.slice(0, -3);
      const text = template ? fill(await vault.read(template), title, moment(), instance) : "";
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
}

const commandName = (period: Period) => period.command ?? `Open this ${period.name.toLowerCase()}`;

const DOCS = "https://github.com/Kosyakssss/zhami/blob/main/docs";
// GitHub's heading anchors: lowercase, punctuation dropped, spaces to dashes.
const anchor = (period: Period) =>
  period.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");

const MMDD = (value: string) => (/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value) && value !== "02-29" ? undefined : "Use MM-DD, like 04-01");

// Settings are declarative: the default folder and hemisphere, then one page
// per period under its group's heading. Control keys are paths into the
// settings, like "formats.week".
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
    const target = parts.reduce<any>((object, part) => (object[part] ??= {}), this.plugin.settings);
    target[last] = typeof value === "string" ? value.trim() : value;
    await this.plugin.saveSettings();

    const period = PERIODS.find((p) => p.key === last);
    if (parts[0] === "enabled" && period) this.plugin.toggleCommand(period);
    // Values shown elsewhere (the list's paths, previews, the reference) follow.
    if (parts[0] !== "formats") this.update();
    this.refreshDomState();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const { settings } = this.plugin;
    return [
      {
        type: "group",
        items: [
          {
            name: "Folder",
            desc: "New notes go here, unless a period has its own folder.",
            control: { type: "folder", key: "folder", placeholder: "Vault root" },
          },
          {
            name: "Hemisphere",
            desc: "Seasons and the Wheel of the Year flip in the south.",
            control: { type: "dropdown", key: "hemisphere", options: { north: "Northern", south: "Southern" } },
          },
        ],
      },
      ...GROUPS.map(
        (group): SettingDefinitionItem => ({
          type: "group",
          heading: group,
          items: PERIODS.filter((p) => p.group === group).map((period) => ({
            type: "page" as const,
            name: period.name,
            desc: period.span,
            displayValue: () => {
              if (!settings.enabled[period.key]) return "Off";
              try {
                return this.plugin.path(period).path;
              } catch {
                return "On";
              }
            },
            items: this.periodPage(period),
          })),
        }),
      ),
    ];
  }

  periodPage(period: Period): SettingDefinitionItem[] {
    const { settings } = this.plugin;
    const on = () => settings.enabled[period.key] === true;
    const now = () => {
      try {
        return this.plugin.instance(period);
      } catch {
        return undefined;
      }
    };

    return [
      {
        type: "group",
        items: [
          {
            name: commandName(period),
            desc: period.clock ? `${period.span}. Dated in ${period.clock}.` : `${period.span}.`,
            control: { type: "toggle", key: `enabled.${period.key}` },
          },
        ],
      },
      {
        type: "group",
        visible: on,
        items: [
          {
            name: "Folder",
            desc: "Leave empty to use the default folder.",
            control: { type: "folder", key: `folders.${period.key}`, placeholder: settings.folder || "Vault root" },
          },
          ...(period.dates ?? []).map((date) => ({
            name: date.name,
            desc: "Month and day, as MM-DD.",
            control: {
              type: "text" as const,
              key: `dates.${date.key}`,
              placeholder: date.default,
              validate: (value: string) => (value.trim() ? MMDD(value.trim()) : undefined),
            },
          })),
          {
            name: "Name format",
            render: (setting) => {
              const preview = createSpan({ cls: "u-pop" });
              const problem = createDiv({ cls: "mod-warning" });
              const update = (format: string) => {
                const instance = now();
                if (!instance) {
                  preview.setText("none, as today is outside this period's range");
                  return;
                }
                const { text, errors } = render(format || period.format, period, instance);
                preview.setText(text);
                problem.setText(errors.join(". "));
              };
              setting.setDesc(
                createFragment((f) => {
                  f.append("Today's note: ", preview, ". Existing notes keep their names until you rename them.");
                  f.append(problem);
                }),
              );
              setting.addText((text) =>
                text
                  .setPlaceholder(period.format)
                  .setValue(settings.formats[period.key] ?? "")
                  .onChange(async (value) => {
                    update(value.trim());
                    await this.setControlValue(`formats.${period.key}`, value);
                  }),
              );
              update(settings.formats[period.key] ?? "");
            },
          },
          {
            name: "Template",
            desc: "Leave empty for a blank note.",
            control: {
              type: "file",
              key: `templates.${period.key}`,
              placeholder: `Example: Templates/${period.name}.md`,
              filter: (file: TFile) => file.extension === "md",
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Examples",
        visible: on,
        items: period.examples.map((format) => ({
          name: format,
          searchable: false,
          render: (setting: Setting) => {
            const instance = now();
            setting.nameEl.addClass("zhami-token");
            if (instance) setting.controlEl.createSpan({ cls: "zhami-value", text: render(format, period, instance).text });
            const used = this.plugin.format(period) === format;
            setting.addButton((button) =>
              button
                .setButtonText(used ? "In use" : "Use")
                .setDisabled(used)
                .onClick(() => {
                  settings.formats[period.key] = format === period.format ? "" : format;
                  void this.plugin.saveSettings();
                  this.update();
                }),
            );
          },
        })),
      },
      {
        type: "group",
        heading: "Reference",
        visible: on,
        items: [
          ...(now() ? reference(period, now()!) : []).map((row) => ({
            name: row.token,
            desc: row.desc,
            searchable: false,
            render: (setting: Setting) => {
              setting.nameEl.addClass("zhami-token");
              setting.controlEl.createSpan({ cls: "zhami-value", text: row.value });
            },
          })),
          {
            name: "Documentation",
            desc: "Every period's formats, tokens and sources, on GitHub.",
            action: () => window.open(`${DOCS}/periods.md#${anchor(period)}`),
          },
        ],
      },
      {
        type: "group",
        visible: on,
        items: [
          {
            type: "page",
            name: "Rename notes",
            desc: "Give notes made with another format, or by hand, this period's names.",
            page: () => new RenamePage(this.plugin, period),
          },
        ],
      },
    ];
  }
}

// A page that finds notes by one format and renames them to another. It
// reads the folder each time it opens, so notes made by hand count too.
class RenamePage extends SettingPage {
  private all: Instance[] | undefined;

  constructor(
    private plugin: Zhami,
    private period: Period,
  ) {
    super();
    this.title = `Rename ${period.name.toLowerCase()} notes`;
  }

  display() {
    const { containerEl, plugin, period } = this;
    containerEl.empty();
    const state = { find: plugin.format(period), to: plugin.format(period), folder: plugin.folder(period) };
    const results = createDiv();
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => this.show(results, state), 150);
    };

    new Setting(containerEl)
      .setName("Find")
      .setDesc("The names your notes have now. * matches any text.")
      .addText((text) =>
        text.setValue(state.find).onChange((value) => {
          state.find = value;
          refresh();
        }),
      );
    new Setting(containerEl)
      .setName("Rename to")
      .setDesc("Each * puts back what its * in Find matched.")
      .addText((text) =>
        text.setValue(state.to).onChange((value) => {
          state.to = value;
          refresh();
        }),
      );
    new Setting(containerEl)
      .setName("In folder")
      .setDesc("Subfolders count, for formats with a slash.")
      .addSearch((search) => {
        new FolderSuggest(plugin.app, search.inputEl);
        search
          .setPlaceholder("Vault root")
          .setValue(state.folder)
          .onChange((value) => {
            state.folder = value.trim();
            refresh();
          });
      });
    containerEl.append(results);
    this.show(results, state);
  }

  show(el: HTMLElement, state: { find: string; to: string; folder: string }) {
    const { app } = this.plugin;
    el.empty();
    this.all ??= instances(this.period, this.plugin.context, moment());
    const folder = normalizePath(state.folder || "/");
    const prefix = folder === "/" ? "" : `${folder}/`;
    const files = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
    const paths = files.map((f) => f.path.slice(prefix.length, -3));
    const result = plan(paths, this.period, this.all, state.find.trim(), state.to.trim(), (p) =>
      Boolean(app.vault.getAbstractFileByPath(`${prefix}${p}.md`)),
    );

    if (result.error) {
      new Setting(el).setName(result.error).setClass("mod-warning");
      return;
    }
    const button = new Setting(el)
      .setName(result.moves.length ? `${result.moves.length} notes match` : "No notes match")
      .setDesc("Links to them update, as with any rename in Obsidian.");
    if (result.moves.length) {
      button.addButton((b) =>
        b
          .setButtonText(`Rename ${result.moves.length} notes`)
          .setCta()
          .onClick(async () => {
            b.setDisabled(true);
            for (const move of result.moves) {
              const file = app.vault.getFileByPath(`${prefix}${move.from}.md`);
              if (!file) continue;
              const target = normalizePath(`${prefix}${move.to}.md`);
              await this.plugin.ensureFolder(target.split("/").slice(0, -1).join("/"));
              await app.fileManager.renameFile(file, target);
            }
            new Notice(`Zhami: renamed ${result.moves.length} notes`);
            this.show(el, state);
          }),
      );
    }
    const list = el.createEl("ul", { cls: "zhami-moves" });
    for (const move of result.moves.slice(0, 200)) list.createEl("li", { text: `${move.from} → ${move.to}` });
    if (result.moves.length > 200) list.createEl("li", { text: `and ${result.moves.length - 200} more` });
    if (result.conflicts.length) {
      new Setting(el).setName(`${result.conflicts.length} notes are skipped`).setHeading();
      const skipped = el.createEl("ul", { cls: "zhami-moves" });
      for (const c of result.conflicts) skipped.createEl("li", { text: `${c.from} → ${c.to}: ${c.reason}` });
    }
  }
}

class FolderSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private input: HTMLInputElement,
  ) {
    super(app, input);
  }

  getSuggestions(query: string) {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f) => f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(q))
      .map((f) => f.path)
      .sort();
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
