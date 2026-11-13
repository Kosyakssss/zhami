// Drives real Obsidian through its CLI, in test/zhami-vault, and checks what
// Zhami does there against what src computes here. Needs Obsidian running
// with the test vault open. Run with `bun run e2e`.
import { cpSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import moment from "moment";
import { fill, render } from "../../src/format";
import { useMoment } from "../../src/moment";
import { next, PERIODS, previous, type Context, type Period } from "../../src/periods";

useMoment(moment);
const VAULT = "zhami-vault";
const ROOT = join(import.meta.dir, "..", "zhami-vault");
const DATA = join(ROOT, ".obsidian/plugins/zhami/data.json");

function ob(...args: string[]): string {
  const proc = Bun.spawnSync(["timeout", "-s", "KILL", "20", "obsidian", `vault=${VAULT}`, ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0 && !proc.stdout.length) throw new Error(`obsidian ${args[0]} failed: ${proc.stderr}`);
  return proc.stdout.toString().trim();
}

// Runs JavaScript in Obsidian and returns its JSON result. `z` is the plugin.
function js<T = unknown>(body: string): T {
  const out = ob("eval", `code=const z = app.plugins.plugins.zhami; return JSON.stringify(await (async () => { ${body} })());`);
  const m = /(?:^|\n)=> ([\s\S]*)$/.exec(out);
  if (!m) throw new Error(`eval failed: ${out}`);
  return JSON.parse(m[1]!) as T;
}

const sleep = (ms: number) => Bun.sleep(ms);
const failures: string[] = [];
let passed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${name}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(got)}`);
}

async function configure(settings: object) {
  writeFileSync(DATA, JSON.stringify(settings, null, 2));
  ob("plugin:reload", "id=zhami");
  await sleep(500);
}

async function command(id: string) {
  ob("command", `id=zhami:${id}`);
  await sleep(300);
  return js<string | null>("return app.workspace.getActiveFile()?.path ?? null");
}

const ctx: Context = { hemisphere: "north", dates: {} };
const name = (p: Period, i = p.at(moment(), ctx)) => render(p.format, p, i).text;

// Install the build and start from an empty Calendar.
cpSync(join(import.meta.dir, "../../main.js"), join(ROOT, ".obsidian/plugins/zhami/main.js"));
cpSync(join(import.meta.dir, "../../manifest.json"), join(ROOT, ".obsidian/plugins/zhami/manifest.json"));
cpSync(join(import.meta.dir, "../../styles.css"), join(ROOT, ".obsidian/plugins/zhami/styles.css"));
for (const dir of ["Calendar", "Weeks", "Rename"]) rmSync(join(ROOT, dir), { recursive: true, force: true });
await sleep(500);
ob("dev:errors", "clear");

// Commands exist only for periods that are on.
await configure({ folder: "Calendar", enabled: { month: false } });
const ids = ob("commands", "filter=zhami:").split("\n").map((l) => l.split("\t")[0]!.trim()).filter(Boolean).sort();
check(
  "commands for the default periods",
  ids,
  ["quarter", "week", "year"].flatMap((k) => [`zhami:open-${k}`, `zhami:open-next-${k}`, `zhami:open-previous-${k}`]).sort(),
);

// Every period: this, next twice, previous, all named as src names them.
await configure({ folder: "Calendar", enabled: Object.fromEntries(PERIODS.map((p) => [p.key, true])) });
for (const p of PERIODS) {
  const here = p.at(moment(), ctx);
  const after = next(p, ctx, here);
  check(`${p.key}: open this`, await command(`open-${p.key}`), `Calendar/${name(p, here)}.md`);
  check(`${p.key}: open next`, await command(`open-next-${p.key}`), `Calendar/${name(p, after)}.md`);
  check(`${p.key}: open next again`, await command(`open-next-${p.key}`), `Calendar/${name(p, next(p, ctx, after))}.md`);
  check(`${p.key}: open previous`, await command(`open-previous-${p.key}`), `Calendar/${name(p, after)}.md`);
}
ob("open", "path=Welcome.md");
await sleep(300);
const week = PERIODS.find((p) => p.key === "week")!;
check(
  "previous from a note that isn't a period's steps from today",
  await command("open-previous-week"),
  `Calendar/${name(week, previous(week, ctx, week.at(moment(), ctx)))}.md`,
);

// Templates are filled with the period's values.
rmSync(join(ROOT, "Calendar"), { recursive: true, force: true });
await sleep(300);
await configure({
  folder: "Calendar",
  enabled: { quarter: true, sekki: true },
  templates: { quarter: "Templates/Quarter.md", sekki: "Templates/Sekki" },
});
for (const key of ["quarter", "sekki"]) {
  const p = PERIODS.find((x) => x.key === key)!;
  const path = await command(`open-${key}`);
  const instance = p.at(moment(), ctx);
  const template = readFileSync(join(ROOT, `Templates/${p.name}.md`), "utf8");
  const text = readFileSync(join(ROOT, path!), "utf8");
  // {{time}} may tick over between the two; compare without it.
  const strip = (s: string) => s.replace(/\d\d:\d\d/g, "HH:mm");
  check(`${key}: template filled`, strip(text), strip(fill(template, name(p, instance), moment(), instance)));
}

// A folder per period, and slashes in a format make subfolders.
await configure({ folder: "Calendar", folders: { week: "Weeks" }, formats: { week: "GGGG/[W]WW" } });
check("own folder and subfolders", await command("open-week"), `Weeks/${moment().format("GGGG/[W]WW")}.md`);

// A format with a token the period doesn't have opens nothing and says why.
await configure({ folder: "Calendar", formats: { week: "{{PPPP}}" } });
const before = js<number>("return app.vault.getMarkdownFiles().length");
ob("command", "id=zhami:open-week");
await sleep(300);
check("bad format creates nothing", js<number>("return app.vault.getMarkdownFiles().length"), before);
check(
  "bad format shows why",
  js<boolean>(`return [...document.querySelectorAll(".notice")].some((n) => n.textContent.includes("{{PPPP}} isn't a token for weeks"))`),
  true,
);

// Settings from an older version are tidied on load.
await configure({ folder: "Calendar", enabled: { season: false }, formats: { week: "GGGG-[W]WW", fortnight: "GGGG-[F]{{n}}", year: "[Year ]YYYY" }, templates: { week: "" } });
const tidied = JSON.parse(readFileSync(DATA, "utf8"));
check("old settings tidied", [tidied.formats, tidied.templates, "season" in tidied.enabled], [{ year: "[Year ]YYYY" }, {}, false]);

// No errors from Zhami along the way.
const errors = ob("dev:errors");
check("no errors", /zhami/i.test(errors) ? errors : "", "");

console.log(failures.join("\n"));
console.log(`\n${passed} pass, ${failures.length} fail`);
if (failures.length) process.exit(1);
