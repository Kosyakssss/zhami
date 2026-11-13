// Drives real Obsidian through its CLI, in test/zhami-vault, and checks what
// Zhami does there against what src computes here. Needs Obsidian running
// with the test vault open. Run with `bun run e2e`. Screenshots of the
// settings, desktop and mobile, land in test/e2e/shots/ to look at.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import moment from "moment";
import { fill, reference, render } from "../../src/format";
import { useMoment } from "../../src/moment";
import { next, PERIODS, previous, type Context, type Period } from "../../src/periods";

useMoment(moment);
const VAULT = "zhami-vault";
const ROOT = join(import.meta.dir, "..", "zhami-vault");
const DATA = join(ROOT, ".obsidian/plugins/zhami/data.json");
const SHOTS = join(import.meta.dir, "shots");

function ob(...args: string[]): string {
  const proc = Bun.spawnSync(["timeout", "-s", "KILL", "120", "obsidian", `vault=${VAULT}`, ...args], { stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0 && !proc.stdout.length) throw new Error(`obsidian ${args[0]} failed: ${proc.stderr}`);
  return proc.stdout.toString().trim();
}

// Helpers for code run in Obsidian: `z` is the plugin, `s` the settings
// window. `rows()` are the setting rows you can see on the current page.
const PRELUDE = `
const z = app.plugins.plugins.zhami;
const s = app.setting;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const page = () => s.getCurrentPageEl();
const rows = () => [...page().querySelectorAll(".setting-item")].filter((i) => i.offsetParent !== null);
const row = (name) => rows().find((i) => i.querySelector(".setting-item-name")?.textContent === name);
const named = (i) => i.querySelector(".setting-item-name")?.textContent;
const goto = async (...path) => {
  if (!s.isOpen) s.open();
  s.openTabById("zhami");
  await wait(300);
  if (path.length) {
    s.openPagePath("zhami", path);
    await wait(400);
  }
};
const type = async (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await wait(400);
};
// Waits for Rename notes to finish looking.
const settle = async () => {
  const desc = () => rows()[3]?.querySelector(".setting-item-description")?.textContent ?? "";
  for (let i = 0; i < 1000 && desc().startsWith("Looking through"); i++) await wait(100);
  return desc();
};
`;

// Runs JavaScript in Obsidian and returns its JSON result.
function js<T = unknown>(body: string): T {
  // eval takes an expression and awaits it.
  const out = ob("eval", `code=(async () => { ${PRELUDE} return JSON.stringify((await (async () => { ${body} })()) ?? null); })()`);
  const m = /(?:^|\n)=> ([\s\S]*)$/.exec(out);
  if (!m) throw new Error(`eval failed: ${out}`);
  return JSON.parse(m[1]!) as T;
}

// A screenshot of the window as it is now. The CLI's own screenshot can
// be stale when Obsidian is in the background; DevTools' paints a frame.
function shot(name: string) {
  const out = ob("dev:cdp", "method=Page.captureScreenshot", 'params={"format":"png"}');
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(JSON.parse(out).data, "base64"));
}

const sleep = (ms: number) => Bun.sleep(ms);
const failures: string[] = [];
let passed = 0;
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${name}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(got)}`);
}

async function configure(settings: object) {
  js("s.close()");
  writeFileSync(DATA, JSON.stringify(settings, null, 2));
  ob("plugin:reload", "id=zhami");
  await sleep(500);
}

const saved = () => JSON.parse(readFileSync(DATA, "utf8"));

async function command(id: string) {
  ob("command", `id=zhami:${id}`);
  await sleep(300);
  return js<string | null>("return app.workspace.getActiveFile()?.path ?? null");
}

const ctx: Context = { hemisphere: "north", dates: {} };
const name = (p: Period, i = p.at(moment(), ctx), format = p.format) => render(format, p, i).text;
const period = (key: string) => PERIODS.find((p) => p.key === key)!;
const allOn = Object.fromEntries(PERIODS.map((p) => [p.key, true]));

// Install the build and start from an empty Calendar. Settings open in the
// main window, so screenshots show them, and renames update links.
cpSync(join(import.meta.dir, "../../main.js"), join(ROOT, ".obsidian/plugins/zhami/main.js"));
cpSync(join(import.meta.dir, "../../manifest.json"), join(ROOT, ".obsidian/plugins/zhami/manifest.json"));
cpSync(join(import.meta.dir, "../../styles.css"), join(ROOT, ".obsidian/plugins/zhami/styles.css"));
for (const dir of ["Calendar", "Weeks"]) rmSync(join(ROOT, dir), { recursive: true, force: true });
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS);
// Obsidian slows timers in a window that's in the background; Rename notes
// searches on them.
js(`s.close(); app.vault.setConfig("settingsPopoutWindow", false); app.vault.setConfig("alwaysUpdateLinks", true); require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false);`);
ob("dev:mobile", "off");
await sleep(500);
ob("dev:errors", "clear");

// --- Commands ---------------------------------------------------------------

// Commands exist only for periods that are on.
await configure({ folder: "Calendar", enabled: { month: false } });
const ids = ob("commands", "filter=zhami:").split("\n").map((l) => l.split("\t")[0]!.trim()).filter(Boolean).sort();
check(
  "commands for the default periods",
  ids,
  ["quarter", "week", "year"].flatMap((k) => [`zhami:open-${k}`, `zhami:open-next-${k}`, `zhami:open-previous-${k}`]).sort(),
);

// Every period: this, next twice, previous, all named as src names them.
await configure({ folder: "Calendar", enabled: allOn });
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
const week = period("week");
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
  const p = period(key);
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
const tidied = saved();
check("old settings tidied", [tidied.formats, tidied.templates, "season" in tidied.enabled], [{ year: "[Year ]YYYY" }, {}, false]);

// --- Settings ---------------------------------------------------------------

// The main page lists every period under its group, with today's note or Off.
await configure({ folder: "Calendar", enabled: { month: false, sekki: true } });
const listed = js<[string, string][]>(`await goto(); return rows().filter((i) => i.classList.contains("mod-navigable")).map((i) => [named(i), i.querySelector(".setting-item-value").textContent]);`);
const on = (p: Period) => ["week", "quarter", "year", "sekki"].includes(p.key);
check(
  "main page: every period, with today's note or Off",
  listed,
  PERIODS.map((p) => [p.name, on(p) ? name(p) : "Off"]),
);
check(
  "main page: group headings in order",
  js<string[]>(`return [...page().querySelectorAll(".setting-item-heading")].map(named);`),
  [...new Set(PERIODS.map((p) => p.group))],
);
shot("main");

// The hemisphere flips seasons, and the list follows.
await configure({ folder: "Calendar", enabled: { meteorological: true } });
const meteorological = period("meteorological");
const seasons = js<string[]>(`
  await goto();
  const value = () => row("Meteorological season").querySelector(".setting-item-value").textContent;
  const before = value();
  const select = row("Hemisphere").querySelector("select");
  select.value = "south";
  select.dispatchEvent(new Event("change"));
  await wait(400);
  return [before, value()];
`);
check("hemisphere: list follows", seasons, [
  name(meteorological),
  name(meteorological, meteorological.at(moment(), { hemisphere: "south", dates: {} })),
]);
check("hemisphere: saved", saved().hemisphere, "south");

// Each period's page: what it shows matches what src gives, for all 22.
await configure({ folder: "Calendar", enabled: allOn });
for (const p of PERIODS) {
  const here = p.at(moment(), ctx);
  const page = js<{
    on: boolean;
    preview: string;
    warning: string;
    dates: string[];
    examples: [string, string, string][];
    reference: [string, string, string][];
    rename: boolean;
    docs: string[];
  }>(`
    await goto(${JSON.stringify(p.name)});
    const tokens = rows().filter((i) => i.querySelector(".zhami-token"));
    const opened = [];
    const open = window.open;
    window.open = (url) => opened.push(url);
    row("Documentation").click();
    window.open = open;
    return {
      on: row("Commands").querySelector(".checkbox-container").classList.contains("is-enabled"),
      preview: row("Name format").querySelector(".u-pop").textContent,
      warning: row("Name format").querySelector(".mod-warning").textContent,
      dates: rows().filter((i) => i.querySelector(".setting-item-description")?.textContent === "Month and day, as MM-DD.").map(named),
      examples: tokens.filter((i) => i.querySelector("button")).map((i) => [named(i), i.querySelector(".setting-item-description").textContent, i.querySelector("button").textContent]),
      reference: tokens.filter((i) => !i.querySelector("button")).map((i) => [named(i), i.querySelector(".setting-item-description").textContent, i.querySelector(".zhami-value").textContent]),
      rename: Boolean(row("Rename notes")),
      docs: opened,
    };
  `);
  check(`${p.key} page: commands on`, page.on, true);
  check(`${p.key} page: today's note`, [page.preview, page.warning], [name(p, here), ""]);
  check(`${p.key} page: date fields`, page.dates, (p.dates ?? []).map((d) => d.name));
  check(
    `${p.key} page: examples`,
    page.examples,
    p.examples.map((f) => [f, name(p, here, f), f === p.format ? "In use" : "Use"]),
  );
  check(
    `${p.key} page: reference`,
    page.reference,
    reference(p, here).map((r) => [r.token, r.desc, r.value || "nothing"]),
  );
  check(`${p.key} page: rename notes`, page.rename, true);
  // The link goes to this period's heading in docs/periods.md.
  const docs = readFileSync(join(import.meta.dir, "../../docs/periods.md"), "utf8");
  const slug = page.docs[0]?.split("#")[1];
  const headings = [...docs.matchAll(/^#+ (.+)$/gm)].map((m) =>
    m[1]!.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-"),
  );
  check(`${p.key} page: documentation link`, [page.docs.length, headings.includes(slug ?? "")], [1, true]);
  if (["week", "sekki", "fashion", "fiscal-quarter"].includes(p.key)) shot(`page-${p.key}`);
}

// Turning a period on in its page shows its settings and adds its commands.
await configure({ folder: "Calendar" });
const toggled = js<{ before: number; after: number }>(`
  await goto("Fortnight");
  const before = rows().length;
  row("Commands").querySelector(".checkbox-container").click();
  await wait(400);
  return { before, after: rows().length };
`);
check("toggle: off shows only the switch", toggled.before, 1);
check("toggle: on shows the rest", toggled.after > 5, true);
check("toggle: saved", saved().enabled.fortnight, true);
check("toggle: commands added", ob("commands", "filter=zhami:open-next-fortnight").includes("zhami:open-next-fortnight"), true);
check(
  "toggle: list follows",
  js<string>(`s.closePage(); await wait(400); return row("Fortnight").querySelector(".setting-item-value").textContent`),
  name(period("fortnight")),
);

// Typing a name format: the preview follows, a wrong token says why.
const typed = js<string[][]>(`
  await goto("Week");
  const input = row("Name format").querySelector("input");
  const seen = [];
  for (const value of ["{{PPPP}}", "GGGG [week] W", ""]) {
    await type(input, value);
    seen.push([row("Name format").querySelector(".u-pop").textContent, row("Name format").querySelector(".mod-warning").textContent]);
  }
  return seen;
`);
const here = week.at(moment(), ctx);
check("format: wrong token", typed[0], ["{{PPPP}}", "{{PPPP}} isn't a token for weeks"]);
check("format: preview follows", typed[1], [name(week, here, "GGGG [week] W"), ""]);
check("format: empty is the default", typed[2], [name(week, here), ""]);
check("format: empty isn't saved", saved().formats, {});

// Use puts an example in the name format; Use on the default clears it.
const used = js<{ input: string; buttons: string[] }[]>(`
  const state = () => ({
    input: row("Name format").querySelector("input").value,
    buttons: rows().filter((i) => i.querySelector(".zhami-token") && i.querySelector("button")).map((i) => i.querySelector("button").textContent),
  });
  await goto("Week");
  row("GGGG [week] W").querySelector("button").click();
  await wait(400);
  const one = state();
  row("GGGG-[W]WW").querySelector("button").click();
  await wait(400);
  return [one, state()];
`);
check("use: fills the name format", used[0]!.input, "GGGG [week] W");
check("use: marks it in use", used[0]!.buttons, week.examples.map((f) => (f === "GGGG [week] W" ? "In use" : "Use")));
check("use: the default empties the field", used[1]!.input, "");
check("use: default in use again", used[1]!.buttons, week.examples.map((f) => (f === week.format ? "In use" : "Use")));
check("use: nothing saved for the default", saved().formats, {});

// Start dates: a bad date isn't saved; a good one moves the season.
await configure({ folder: "Calendar", enabled: { fashion: true } });
const fashion = period("fashion");
const dates = js<{ bad: string; good: string }>(`
  await goto("Fashion season");
  const input = row("Fall-winter starts").querySelector("input");
  await type(input, "13-01");
  const bad = row("Name format").querySelector(".u-pop").textContent;
  await type(input, "12-01");
  return { bad, good: row("Name format").querySelector(".u-pop").textContent };
`);
check("dates: bad one not saved", dates.bad, name(fashion));
check("dates: good one saved", saved().dates, { "fall-winter": "12-01" });
check("dates: preview follows", dates.good, name(fashion, fashion.at(moment(), { hemisphere: "north", dates: { "fall-winter": "12-01" } })));
shot("page-fashion-dates");

// Settings search finds periods by name.
check(
  "search finds a period",
  js<boolean>(`
    await goto();
    s.searchComponent.setValue("Sekki");
    s.onSearchChanged();
    await wait(400);
    const found = s.searchResultsEl.innerText.includes("Sekki");
    s.searchComponent.setValue("");
    s.onSearchChanged();
    return found;
  `),
  true,
);

// --- Rename notes -----------------------------------------------------------

// Notes in an old format get today's names, links follow, clashes are skipped.
await configure({ folder: "Calendar" });
rmSync(join(ROOT, "Calendar"), { recursive: true, force: true });
await sleep(300);
const old = (i = here) => name(week, i, "GGGG [week] W");
const prev = previous(week, ctx, here);
const prev2 = previous(week, ctx, prev);
js(`
  await app.vault.createFolder("Calendar").catch(() => {});
  for (const path of ${JSON.stringify([`Calendar/${old(prev2)}.md`, `Calendar/${old(prev)} trip.md`, `Calendar/${old()}.md`, `Calendar/${name(week)}.md`])}) await app.vault.create(path, "");
  await app.vault.create("Calendar/Links.md", ${JSON.stringify(`[[${old(prev2)}]] and [[${old(prev)} trip]]`)});
  return null;
`);
await sleep(500);
// It looks through every week there is, as two of the notes aren't weeks'.
const started = Date.now();
const renamed = js<{ searched: string; rows: string[]; moves: string[] }>(`
  await goto("Week", "Rename notes");
  await type(rows()[0].querySelector("input"), "GGGG [week] W *");
  await type(rows()[1].querySelector("input"), "GGGG-[W]WW *");
  const searched = await settle();
  return { searched, rows: rows().map(named), moves: [...page().querySelectorAll(".zhami-moves li")].map((li) => li.textContent) };
`);
console.log(`Rename notes looked through every week in ${((Date.now() - started) / 1000).toFixed(1)} s`);
check("rename: looks through every week", renamed.searched, "Looked through every week from 1 to 9999.");
check("rename: wildcard matches one", renamed.moves, [`${old(prev)} trip → ${name(week, prev)} trip`]);
shot("rename-wildcard");
js(`app.vault.setConfig("alwaysUpdateLinks", false); return null;`);
const renaming = js<{ rows: string[]; moves: string[] }>(`
  await type(rows()[0].querySelector("input"), "GGGG [week] W");
  await type(rows()[1].querySelector("input"), "GGGG-[W]WW");
  await settle();
  return { rows: rows().map(named), moves: [...page().querySelectorAll(".zhami-moves li")].map((li) => li.textContent) };
`);
check("rename: plan", renaming.rows.slice(3), ["1 note matches", "Update links", "1 note is skipped"]);
check("rename: moves and clashes", renaming.moves, [
  `${old(prev2)} → ${name(week, prev2)}`,
  `${old()} → ${name(week)}: A note with this name already exists`,
]);
shot("rename");
check(
  "rename: turns on updating links",
  js<[unknown, string[]]>(`row("Update links").querySelector("button").click(); await wait(300); return [app.vault.getConfig("alwaysUpdateLinks"), rows().map(named).slice(3)];`),
  [true, ["1 note matches", "1 note is skipped"]],
);
js(`rows()[3].querySelector("button").click(); await wait(1000); await settle(); return null;`);
check("rename: renamed", existsSync(join(ROOT, `Calendar/${name(week, prev2)}.md`)), true);
check("rename: clash left alone", existsSync(join(ROOT, `Calendar/${old()}.md`)), true);
check("rename: links follow", readFileSync(join(ROOT, "Calendar/Links.md"), "utf8"), `[[${name(week, prev2)}]] and [[${old(prev)} trip]]`);
check(
  "rename: list updates",
  js<string[]>(`return rows().map(named).slice(3);`),
  ["No notes match", "1 note is skipped"],
);

// --- Mobile -----------------------------------------------------------------

// Obsidian's mobile layout, on a phone-sized screen.
ob("dev:mobile", "on");
await sleep(3000);
ob("dev:cdp", "method=Emulation.setDeviceMetricsOverride", 'params={"width":390,"height":844,"deviceScaleFactor":3,"mobile":true}');
await sleep(500);
await configure({ folder: "Calendar", enabled: allOn });
js(`await goto(); return null;`);
shot("phone-main");
for (const key of ["sekki", "fashion"]) {
  const p = period(key);
  check(
    `phone: ${key} page`,
    js<string>(`await goto(${JSON.stringify(p.name)}); return row("Name format").querySelector(".u-pop").textContent`),
    name(p),
  );
  shot(`phone-${key}`);
  js(`page().scrollTop = 1000; await wait(300); return null;`);
  shot(`phone-${key}-examples`);
}
js(`s.close(); return null;`);
ob("dev:cdp", "method=Emulation.clearDeviceMetricsOverride");
ob("dev:mobile", "off");
await sleep(3000);

// No errors from Zhami along the way.
const errors = ob("dev:errors");
check("no errors", /zhami/i.test(errors) ? errors : "", "");
js(`s.close(); require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(true); return null;`);

console.log(failures.join("\n"));
console.log(`\n${passed} pass, ${failures.length} fail`);
if (failures.length) process.exit(1);
