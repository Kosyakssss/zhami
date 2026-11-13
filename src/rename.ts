import type { Moment } from "moment";
import { render } from "./format";
import type { Context, Instance, Period } from "./periods";

// Every occurrence of a period around `around`, newest last, up to `limit`
// each way. Stops early where a period has no data, like zodiac years
// outside 1901 to 2100.
export function instances(period: Period, ctx: Context, around: Moment, limit = 10_000): Instance[] {
  const before: Instance[] = [];
  const after: Instance[] = [];
  const step = (from: Moment, into: Instance[], back: boolean) => {
    let m = from.clone();
    for (let i = 0; i < limit; i++) {
      let instance: Instance;
      try {
        instance = period.at(m, ctx);
      } catch {
        return;
      }
      into.push(instance);
      m = back ? instance.start.clone().subtract(1, "day") : instance.end.clone().add(1, "day").startOf("day");
      if (m.year() < 1 || m.year() > 9999) return;
    }
  };
  step(around, after, false);
  step(after[0] ? after[0].start.clone().subtract(1, "day") : around, before, true);
  return [...before.reverse(), ...after];
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
