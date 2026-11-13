import type { Moment } from "moment";
import { render } from "./format";
import { next, previous, type Context, type Instance, type Period } from "./periods";

// The occurrence after or before `from`, or undefined where there's none:
// outside the years 1 to 9999, or where a period's data ends, like zodiac
// years outside 1901 to 2100.
function step(period: Period, ctx: Context, from: Instance, by: typeof next) {
  let instance: Instance;
  try {
    instance = by(period, ctx, from);
  } catch {
    return undefined;
  }
  const year = instance.start.year();
  return year < 1 || year > 9999 ? undefined : instance;
}

function at(period: Period, ctx: Context, around: Moment) {
  try {
    return period.at(around, ctx);
  } catch {
    return undefined;
  }
}

// Every occurrence of a period, a few at a time outward from `around`, so
// the nearest come first. It keeps none of them, so it can run through
// every year without filling memory.
export class Search {
  // The years searched so far, by when occurrences start.
  from = 0;
  to = 0;
  private here?: Instance;
  private ahead?: Instance;
  private behind?: Instance;

  constructor(
    private period: Period,
    private ctx: Context,
    around: Moment,
  ) {
    this.here = at(period, ctx, around);
  }

  get done() {
    return !this.here && !this.ahead && !this.behind;
  }

  // Takes up to `steps` more steps each way, and returns what they found.
  more(steps: number): Instance[] {
    const out: Instance[] = [];
    const add = (instance: Instance) => {
      const year = instance.start.year();
      this.from = Math.min(this.from, year);
      this.to = Math.max(this.to, year);
      out.push(instance);
    };
    if (this.here) {
      this.from = this.to = this.here.start.year();
      add(this.here);
      this.ahead = this.behind = this.here;
      this.here = undefined;
    }
    for (let i = 0; i < steps && (this.ahead || this.behind); i++) {
      if (this.ahead) this.ahead = step(this.period, this.ctx, this.ahead, next);
      if (this.ahead) add(this.ahead);
      if (this.behind) this.behind = step(this.period, this.ctx, this.behind, previous);
      if (this.behind) add(this.behind);
    }
    return out;
  }
}

// How far next and previous look for the note you're on: the 100 years
// either side of today, or 1000 occurrences each way where that reaches
// further, as for years and decades.
export const REACH = { years: 100, count: 1000 };

// The occurrence a note named `name` under `format` is, if any, within
// reach of `around`. The nearest are tried first.
export function named(period: Period, ctx: Context, format: string, around: Moment, name: string, reach = REACH) {
  const search = new Search(period, ctx, around);
  const near = (instance: Instance) => Math.abs(instance.start.year() - around.year()) <= reach.years;
  for (let steps = 0; !search.done; steps++) {
    const found = search.more(1);
    for (const instance of found) {
      const { text, errors } = render(format, period, instance);
      if (!errors.length && text === name) return instance;
    }
    if (steps >= reach.count && !found.some(near)) break;
  }
  return undefined;
}

export interface Move {
  from: string;
  to: string;
}

export interface Plan {
  moves: Move[];
  // Notes that would land on an existing note, or on the same name as another.
  conflicts: (Move & { reason: string })[];
  error?: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface Hit {
  instance: Instance;
  // What each * in Find matched.
  captures: string[];
}

// Tells which occurrence each note is, from its name under `find`.
// Occurrences are added as a search finds them, and the first to fit a note
// is its occurrence.
export class Matcher {
  error?: string;
  hits = new Map<string, Hit>();
  // Notes by name, and by reversed name, sorted to look up by start or end.
  private starts: string[];
  private ends: string[];

  constructor(
    private period: Period,
    private find: string,
    private paths: string[],
  ) {
    this.starts = [...paths].sort();
    this.ends = paths.map(reverse).sort();
  }

  // Whether every note has its occurrence.
  get full() {
    return this.hits.size === new Set(this.paths).size;
  }

  add(instances: Instance[]) {
    for (const instance of instances) {
      if (this.error) return;
      const rendered = render(this.find, this.period, instance);
      if (rendered.errors.length) {
        this.error = rendered.errors[0];
        return;
      }
      const parts = rendered.text.split("*");
      // Notes are looked up by the text before the first *, or after the last.
      const head = parts[0]!;
      const tail = parts[parts.length - 1]!;
      if (!head && !tail) {
        this.error = "Find needs some text or a token around *";
        return;
      }
      const pattern = new RegExp(`^${parts.map(escape).join("(.*?)")}$`);
      const candidates = head ? starting(this.starts, head) : starting(this.ends, reverse(tail)).map(reverse);
      for (const path of candidates) {
        if (this.hits.has(path)) continue;
        const m = pattern.exec(path);
        if (m) this.hits.set(path, { instance, captures: m.slice(1) });
      }
    }
  }
}

const reverse = (s: string) => [...s].reverse().join("");

// The strings in sorted `list` that start with `prefix`.
function starting(list: string[], prefix: string) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]! < prefix) lo = mid + 1;
    else hi = mid;
  }
  const out: string[] = [];
  for (let i = lo; i < list.length && list[i]!.startsWith(prefix); i++) out.push(list[i]!);
  return out;
}

// The renames for notes matched by `find`: their names under `to`, and the
// notes skipped. Paths are relative to the period's folder, without .md. A *
// in `find` matches any text, and each * in `to` puts back what the matching
// * matched, in order. File names can't contain *, so it never clashes with
// a real name.
export function decide(
  hits: [path: string, hit: Hit][],
  period: Period,
  find: string,
  to: string,
  exists: (path: string) => boolean,
): Plan {
  if ((to.match(/\*/g) ?? []).length > (find.match(/\*/g) ?? []).length) {
    return { moves: [], conflicts: [], error: "Rename to has more * than Find" };
  }
  const moves: Move[] = [];
  const conflicts: Plan["conflicts"] = [];
  // Names already taken: by matched notes that keep theirs, then by moves.
  const targets = new Map<string, string>();
  for (const [path, hit] of hits) {
    const rendered = render(to, period, hit.instance);
    if (rendered.errors.length) return { moves: [], conflicts: [], error: rendered.errors[0] };
    let k = 0;
    const target = rendered.text.replace(/\*/g, () => hit.captures[k++] ?? "");
    if (target === path) {
      targets.set(path, path);
      continue;
    }
    const move = { from: path, to: target };
    if (targets.has(target)) conflicts.push({ ...move, reason: `Same new name as ${targets.get(target)}` });
    else if (exists(target)) conflicts.push({ ...move, reason: "A note with this name already exists" });
    else {
      targets.set(target, path);
      moves.push(move);
    }
  }
  return { moves, conflicts };
}

// The renames for `paths`, given every occurrence to look among.
export function plan(
  paths: string[],
  period: Period,
  all: Instance[],
  find: string,
  to: string,
  exists: (path: string) => boolean,
): Plan {
  const matcher = new Matcher(period, find, paths);
  matcher.add(all);
  if (matcher.error) return { moves: [], conflicts: [], error: matcher.error };
  const hits = paths.flatMap((path): [string, Hit][] => {
    const hit = matcher.hits.get(path);
    return hit ? [[path, hit]] : [];
  });
  return decide(hits, period, find, to, exists);
}
