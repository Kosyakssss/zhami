import {
  AbstractInputSuggest,
  addIcon,
  App,
  EditorSuggest,
  type Editor,
  type EditorPosition,
  type EditorSuggestContext,
  type EditorSuggestTriggerInfo,
  type ButtonComponent,
  moment as obsidianMoment,
  normalizePath,
  Notice,
  prepareSimpleSearch,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingPage,
  SuggestModal,
  TFolder,
  type SettingDefinitionItem,
  type TFile,
} from "obsidian";
import { fill, reference, render } from "./src/format";
import { moment, useMoment } from "./src/moment";
import { GROUPS, next, noun, PERIODS, previous, type Context, type Instance, type Period } from "./src/periods";
import { decide, Matcher, named, Search, type Hit } from "./src/rename";
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
    this.registerEditorSuggest(new LinkSuggest(this));
    this.addCommand({
      id: "insert-link",
      name: "Insert link to a period note",
      icon: ICON,
      editorCallback: (editor) => new LinkModal(this, editor).open(),
    });
  }

  async saveSettings() {
    await this.saveData(tidy(this.settings));
  }

  get context(): Context {
    return { hemisphere: this.settings.hemisphere, dates: this.settings.dates };
  }

  // Only enabled periods get commands, so the command palette stays short.
  toggleCommand(period: Period) {
    for (const step of STEPS) {
      const id = `open-${step.id}${period.key}`;
      if (this.settings.enabled[period.key]) {
        this.addCommand({ id, name: `Open ${step.word} ${noun(period)}`, icon: ICON, callback: () => void this.open(period, step.by) });
      } else {
        this.removeCommand(id);
      }
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

  // The occurrence an open note is, if it's one of this period's notes.
  // Remembered by path, format and settings, so a note that isn't one is
  // only searched for once.
  private seen = new Map<string, Instance | undefined>();
  showing(period: Period): Instance | undefined {
    const file = this.app.workspace.getActiveFile();
    const folder = normalizePath(this.folder(period) || "/");
    const prefix = folder === "/" ? "" : `${folder}/`;
    if (!file || file.extension !== "md" || !file.path.startsWith(prefix)) return undefined;
    const format = this.format(period);
    const key = `${period.key}|${format}|${JSON.stringify(this.context)}|${file.path}|${moment().format("YYYY-MM-DD")}`;
    if (!this.seen.has(key)) {
      if (this.seen.size > 1000) this.seen.clear();
      this.seen.set(key, named(period, this.context, format, moment(), file.path.slice(prefix.length, -3)));
    }
    return this.seen.get(key);
  }

  // Opens this occurrence of a period, or the next or previous one, and
  // creates its note from the template if needed. Next and previous step
  // from the period's note you're looking at, or else from today.
  async open(period: Period, by: -1 | 0 | 1 = 0) {
    const { vault, workspace } = this.app;
    let instance: Instance;
    try {
      instance = (by && this.showing(period)) || this.instance(period);
      if (by === 1) instance = next(period, this.context, instance);
      if (by === -1) instance = previous(period, this.context, instance);
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

// Links to period notes, typed as @this week, @next sekki or @last month,
// or picked with a command.
interface Link {
  label: string;
  name: string;
}

const WORDS: Record<string, -1 | 0 | 1> = { this: 0, next: 1, last: -1, previous: -1 };
// Lowercase, without accents, so "ko" finds kō.
const plain = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// The link to this, the next or the last occurrence of a period, by its
// note's name today.
function link(plugin: Zhami, period: Period, word: string): Link[] {
  const by = WORDS[word];
  if (by === undefined) return [];
  try {
    let instance = plugin.instance(period);
    if (by === 1) instance = next(period, plugin.context, instance);
    if (by === -1) instance = previous(period, plugin.context, instance);
    const { text, errors } = render(plugin.format(period), period, instance);
    return errors.length ? [] : [{ label: `${word} ${noun(period)}`, name: text }];
  } catch {
    return [];
  }
}

function renderLink(link: Link, el: HTMLElement) {
  el.addClass("mod-complex");
  const content = el.createDiv({ cls: "suggestion-content" });
  content.createDiv({ cls: "suggestion-title", text: link.label });
  content.createDiv({ cls: "suggestion-note", text: link.name });
}

// @ answers only once a space follows its first word, so @today and the
// like stay with Aloha. Natural Language Dates reads every @ as a date, so
// with it on, @ stays with it and the command does this instead.
class LinkSuggest extends EditorSuggest<Link> {
  constructor(private plugin: Zhami) {
    super(plugin.app);
  }

  // The enabled periods with a word in their name starting with `rest`.
  private matching(rest: string) {
    const query = ` ${plain(rest)}`;
    return PERIODS.filter((p) => this.plugin.settings.enabled[p.key] && ` ${plain(noun(p))}`.includes(query));
  }

  onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
    const loaded = (this.app as App & { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
    if (loaded?.["nldates-obsidian"]) return null;
    const before = editor.getLine(cursor.line).slice(0, cursor.ch);
    const m = /(?:^|\s)@(\w+) ([^@]{0,40})$/u.exec(before);
    if (!m || !(m[1]!.toLowerCase() in WORDS) || !this.matching(m[2]!).length) return null;
    return { start: { line: cursor.line, ch: cursor.ch - m[1]!.length - m[2]!.length - 2 }, end: cursor, query: `${m[1]} ${m[2]}` };
  }

  getSuggestions(context: EditorSuggestContext): Link[] {
    const [word, ...rest] = context.query.split(" ");
    return this.matching(rest.join(" ")).flatMap((period) => link(this.plugin, period, word!.toLowerCase()));
  }

  renderSuggestion(link: Link, el: HTMLElement) {
    renderLink(link, el);
  }

  selectSuggestion(link: Link) {
    if (!this.context) return;
    this.context.editor.replaceRange(`[[${link.name}]]`, this.context.start, this.context.end);
  }
}

class LinkModal extends SuggestModal<Link> {
  private links: Link[];

  constructor(
    plugin: Zhami,
    private editor: Editor,
  ) {
    super(plugin.app);
    this.setPlaceholder("This week, next sekki, last month…");
    this.links = PERIODS.filter((p) => plugin.settings.enabled[p.key]).flatMap((p) =>
      ["this", "next", "last"].flatMap((word) => link(plugin, p, word)),
    );
  }

  getSuggestions(query: string) {
    const search = prepareSimpleSearch(plain(query));
    return this.links.filter((l) => search(plain(l.label)));
  }

  renderSuggestion(link: Link, el: HTMLElement) {
    renderLink(link, el);
  }

  onChooseSuggestion(link: Link) {
    this.editor.replaceSelection(`[[${link.name}]]`);
  }
}

const STEPS = [
  { id: "", word: "this", by: 0 },
  { id: "next-", word: "next", by: 1 },
  { id: "previous-", word: "previous", by: -1 },
] as const;

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
            // Today's note, without the folder, so it fits on a phone.
            displayValue: () => {
              if (!settings.enabled[period.key]) return "Off";
              try {
                return render(this.plugin.format(period), period, this.plugin.instance(period)).text;
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
            name: "Commands",
            desc: `Open this, next and previous ${noun(period)}. ${period.span}.${period.clock ? ` Dated in ${period.clock}.` : ""}`,
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
            if (instance) setting.setDesc(render(format, period, instance).text);
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
              setting.controlEl.createSpan({ cls: "zhami-value", text: row.value || "nothing" });
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
// reads the folder each time, so notes made by hand count too, and looks
// through every occurrence of the period in the background, nearest first,
// until each note has matched or there are none left.
class RenamePage extends SettingPage {
  // Bumped to stop the search that's running.
  private run = 0;

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

  hide() {
    this.run++;
    super.hide();
  }

  // Matches the folder's notes as the search finds occurrences, a few
  // milliseconds at a time so Obsidian stays responsive, and shows the
  // renames so far.
  show(el: HTMLElement, state: { find: string; to: string; folder: string }) {
    const run = ++this.run;
    const { app } = this.plugin;
    const vault = app.vault as typeof app.vault & Config;
    const { period } = this;
    const find = state.find.trim();
    const to = state.to.trim();
    const folder = normalizePath(state.folder || "/");
    const prefix = folder === "/" ? "" : `${folder}/`;
    const exists = (path: string) => Boolean(vault.getAbstractFileByPath(`${prefix}${path}.md`));
    const paths = vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix))
      .map((f) => f.path.slice(prefix.length, -3));
    const matcher = new Matcher(period, find, paths);
    const search = new Search(period, this.plugin.context, moment());
    let result: ReturnType<typeof decide> = { moves: [], conflicts: [] };

    el.empty();
    const status = new Setting(el);
    const progress = status.controlEl.createDiv({ cls: "zhami-progress" });
    const bar = progress.createDiv();
    let button!: ButtonComponent;
    status.addButton((b) => {
      button = b.setCta().onClick(async () => {
        this.run++;
        button.setDisabled(true);
        for (const move of result.moves) {
          const file = vault.getFileByPath(`${prefix}${move.from}.md`);
          if (!file) continue;
          const target = normalizePath(`${prefix}${move.to}.md`);
          await this.plugin.ensureFolder(target.split("/").slice(0, -1).join("/"));
          await app.fileManager.renameFile(file, target);
        }
        new Notice(`Zhami: renamed ${notes(result.moves.length)}`);
        this.show(el, state);
      });
    });
    const links = new Setting(el)
      .setName("Update links")
      .setDesc("Automatically update internal links is off, in Files and links, so Obsidian would ask about links for every note.")
      .addButton((b) =>
        b.setButtonText("Turn on").onClick(() => {
          vault.setConfig("alwaysUpdateLinks", true);
          draw();
        }),
      );
    const lists = el.createDiv();

    const finished = () => Boolean(matcher.error) || search.done || matcher.full;

    // The number of matches the renames were last worked out for.
    let decided = -1;
    const draw = () => {
      if (decided !== matcher.hits.size && !matcher.error) {
        const hits = paths.flatMap((path) => {
          const hit = matcher.hits.get(path);
          return hit ? [[path, hit] as [string, Hit]] : [];
        });
        result = decide(hits, period, find, to, exists);
        decided = matcher.hits.size;
      }
      const error = matcher.error ?? result.error;
      const searching = !finished();
      const { moves, conflicts } = result;
      status.setName(
        error ??
          (moves.length ? `${notes(moves.length)} ${moves.length === 1 ? "matches" : "match"}` : searching ? "No notes match yet" : "No notes match"),
      );
      status.settingEl.toggleClass("mod-warning", Boolean(error));
      status.setDesc(
        error
          ? ""
          : !paths.length
            ? "The folder has no notes."
            : searching
              ? `Looking through ${search.from} to ${search.to}…`
              : search.done
                ? `Looked through every ${noun(period)} from ${search.from} to ${search.to}.`
                : "Every note in the folder matches.",
      );
      progress.toggle(!error && searching);
      // Years 1 to 9999, the most any period covers.
      bar.style.width = `${Math.max(2, ((search.to - search.from) / 9998) * 100)}%`;
      button.buttonEl.toggle(!error && moves.length > 0);
      button.setButtonText(`Rename ${notes(moves.length)}`);
      links.settingEl.toggle(!error && moves.length > 0 && !vault.getConfig("alwaysUpdateLinks"));

      lists.empty();
      if (error) return;
      const list = lists.createEl("ul", { cls: "zhami-moves" });
      for (const move of moves.slice(0, 200)) list.createEl("li").createSpan({ cls: "zhami-token", text: `${move.from} → ${move.to}` });
      if (moves.length > 200) list.createEl("li", { text: `and ${moves.length - 200} more` });
      if (conflicts.length) {
        new Setting(lists).setName(`${notes(conflicts.length)} ${conflicts.length === 1 ? "is" : "are"} skipped`).setHeading();
        const skipped = lists.createEl("ul", { cls: "zhami-moves" });
        for (const c of conflicts) {
          const li = skipped.createEl("li");
          li.createSpan({ cls: "zhami-token", text: `${c.from} → ${c.to}` });
          li.append(`: ${c.reason}`);
        }
      }
    };

    let drawn = 0;
    const work = () => {
      if (run !== this.run) return;
      const until = performance.now() + 15;
      while (performance.now() < until && !finished()) matcher.add(search.more(50));
      const done = finished();
      if (done || performance.now() - drawn > 250) {
        draw();
        drawn = performance.now();
      }
      if (!done) window.setTimeout(work);
    };
    work();
  }
}

// Obsidian's own settings, like Automatically update internal links.
interface Config {
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
}

const notes = (n: number) => `${n} ${n === 1 ? "note" : "notes"}`;

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
