import type { Moment } from "moment";
import { moment, normalizePath, Notice, Plugin } from "obsidian";

// Obsidian's typings export moment as a namespace; at runtime it is the moment function.
const today = moment as unknown as () => Moment;

const FOLDER = "Calendar";
const DAY = "YYYY-MM-DD";

type Unit = "isoWeek" | "quarter" | "year";

interface Period {
  id: string;
  name: string;
  unit: Unit;
  format: string;
  template: string;
}

const PERIODS: Period[] = [
  {
    id: "open-week",
    name: "Open this week",
    unit: "isoWeek",
    format: "GGGG-[W]WW",
    template: "Templates/Year-Week template.md",
  },
  {
    id: "open-quarter",
    name: "Open this quarter",
    unit: "quarter",
    format: "YYYY-[Q]Q",
    template: "Templates/Year-Quarter template.md",
  },
  {
    id: "open-year",
    name: "Open this year",
    unit: "year",
    format: "YYYY",
    template: "Templates/Year template.md",
  },
];

export default class Zhami extends Plugin {
  onload() {
    for (const period of PERIODS) {
      this.addCommand({ id: period.id, name: period.name, callback: () => this.open(period) });
    }
  }

  async open(period: Period) {
    const { vault, workspace } = this.app;
    const now = today();
    const title = now.format(period.format);
    const path = normalizePath(`${FOLDER}/${title}.md`);

    let file = vault.getFileByPath(path);
    if (!file) {
      if (!vault.getFolderByPath(FOLDER)) await vault.createFolder(FOLDER);
      const template = vault.getFileByPath(period.template);
      if (!template) new Notice(`Template not found: ${period.template}`);
      const text = template ? fill(await vault.read(template), title, now, period.unit) : "";
      file = await vault.create(path, text);
    }
    await workspace.getLeaf(false).openFile(file);
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
