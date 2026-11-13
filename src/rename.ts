import type { Moment } from "moment";
import { render } from "./format";
import { next, previous, type Context, type Instance, type Period } from "./periods";

// How far Zhami looks for a period's notes: the 100 years either side of
// today, or 1000 occurrences each way where that reaches further, as for
// years and decades. Never outside the years 1 to 9999.
export interface Reach {
  years: number;
  count: number;
}
export const REACH: Reach = { years: 100, count: 1000 };

// The occurrence after or before `from`, if it's within reach. `steps`
// counts the steps from `around` so far.
function step(period: Period, ctx: Context, from: Instance, by: typeof next, around: Moment, steps: number, reach: Reach) {
  let instance: Instance;
  try {
    instance = by(period, ctx, from);
  } catch {
    // No data this far out, like zodiac years outside 1901 to 2100.
    return undefined;
  }
  const year = instance.start.year();
  if (year < 1 || year > 9999) return undefined;
  return steps <= reach.count || Math.abs(year - around.year()) <= reach.years ? instance : undefined;
}

function at(period: Period, ctx: Context, around: Moment) {
  try {
    return period.at(around, ctx);
  } catch {
    return undefined;
  }
}

// Every occurrence of a period within reach of `around`, oldest first.
export function instances(period: Period, ctx: Context, around: Moment, reach = REACH): Instance[] {
  const here = at(period, ctx, around);
  if (!here) return [];
  const walk = (by: typeof next) => {
    const out: Instance[] = [];
    let instance: Instance | undefined = here;
    for (let steps = 1; (instance = step(period, ctx, instance, by, around, steps, reach)); steps++) out.push(instance);
    return out;
  };
  return [...walk(previous).reverse(), here, ...walk(next)];
}

// The occurrence a note named `name` under `format` is, if any. It looks
// outward from `around`, so notes near today are found quickest.
export function named(period: Period, ctx: Context, format: string, around: Moment, name: string, reach = REACH) {
  const is = (instance: Instance) => {
    const { text, errors } = render(format, period, instance);
    return !errors.length && text === name;
  };
  const here = at(period, ctx, around);
  if (!here || is(here)) return here;
  let ahead: Instance | undefined = here;
  let behind: Instance | undefined = here;
  for (let steps = 1; ahead || behind; steps++) {
    ahead = ahead && step(period, ctx, ahead, next, around, steps, reach);
    if (ahead && is(ahead)) return ahead;
    behind = behind && step(period, ctx, behind, previous, around, steps, reach);
    if (behind && is(behind)) return behind;
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

// Which notes `find` matches, and their names under `to`. Paths are relative
// to the period's folder, without .md. A * in `find` matches any text, and
// each * in `to` puts back what the matching * matched, in order. File names
// can't contain *, so it never clashes with a real name.
export function plan(
  paths: string[],
  period: Period,
  all: Instance[],
  find: string,
  to: string,
  exists: (path: string) => boolean,
): Plan {
  const wildcards = (find.match(/\*/g) ?? []).length;
  if ((to.match(/\*/g) ?? []).length > wildcards) return { moves: [], conflicts: [], error: "Rename to has more * than Find" };

  // Each occurrence's name under `find`, split at its wildcards.
  const index = new Map<string, { parts: string[]; instance: Instance }[]>();
  let anchored = true;
  for (const instance of all) {
    const rendered = render(find, period, instance);
    if (rendered.errors.length) return { moves: [], conflicts: [], error: rendered.errors[0] };
    const parts = rendered.text.split("*");
    // Look notes up by the text before the first *, or after the last one.
    const key = parts[0] || parts[parts.length - 1]!;
    if (!key) anchored = false;
    const list = index.get(key) ?? [];
    list.push({ parts, instance });
    index.set(key, list);
  }
  if (!anchored) return { moves: [], conflicts: [], error: "Find needs some text or a token around *" };

  const moves: Move[] = [];
  const conflicts: Plan["conflicts"] = [];
  // Names already taken: by matched notes that keep theirs, then by moves.
  const targets = new Map<string, string>();
  for (const path of paths) {
    let hit: { instance: Instance; captures: string[] } | undefined;
    for (let len = 1; len <= path.length && !hit; len++) {
      for (const key of [path.slice(0, len), path.slice(path.length - len)]) {
        for (const candidate of index.get(key) ?? []) {
          const pattern = new RegExp(`^${candidate.parts.map(escape).join("(.*?)")}$`);
          const m = pattern.exec(path);
          if (m) {
            hit = { instance: candidate.instance, captures: m.slice(1) };
            break;
          }
        }
        if (hit) break;
      }
    }
    if (!hit) continue;
    let k = 0;
    const target = render(to, period, hit.instance).text.replace(/\*/g, () => hit.captures[k++] ?? "");
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
