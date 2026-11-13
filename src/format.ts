import type { Moment } from "moment";
import type { Context, Instance, Period } from "./periods";

// Zhami's tokens sit in double braces, so moment never reads them: {{P}} is
// a period's number, {{PPPP}} its name. Everything outside the braces is
// moment's.
const TOKEN = /\{\{\s*([A-Za-z]+\??)(?::([^{}]*))?\}\}/g;

const DAY = "YYYY-MM-DD";

export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens > 10 && tens < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

export interface Row {
  // Exactly what to type.
  token: string;
  // What it means, without examples: the value shows one.
  desc: string;
  // What the token gives for `instance`.
  value: string;
}

// The reference for a period, in settings and docs: moment's tokens worth
// knowing, then Zhami's. Each value comes from rendering its own token.
export function reference(period: Period, instance: Instance): Row[] {
  const rows: [string, string][] = Object.entries(period.momentTokens ?? {});
  if (period.number) {
    rows.push(["{{P}}", period.number], ["{{Po}}", "{{P}} as an ordinal"], ["{{PP}}", "{{P}} with two digits"]);
  }
  for (const [token, desc] of Object.entries(period.labels ?? {})) rows.push([`{{${token}}}`, desc]);
  rows.push(
    ["{{start}}", "First day. Takes a moment format after a colon"],
    ["{{end}}", "Last day. Takes a moment format after a colon"],
    ["{{end?:-YYYY}}", "Last day, only where it differs from the first day in that format"],
  );
  if (instance.year) {
    rows.push(
      ["{{fy:YYYY}}", "First day of the fiscal year"],
      ["{{fyend:YYYY}}", "Last day of the fiscal year"],
    );
  }
  return rows.map(([token, desc]) => ({ token, desc, value: render(token, period, instance).text }));
}

// The value of one token, or undefined if this period doesn't have it.
function value(name: string, arg: string | undefined, instance: Instance): string | undefined {
  const { n, labels } = instance;
  switch (name) {
    case "P":
    case "Po":
    case "PP":
      if (arg !== undefined || n === undefined) return undefined;
      return name === "P" ? `${n}` : name === "Po" ? ordinal(n) : String(n).padStart(2, "0");
    case "PPP":
    case "PPPP":
      return labels?.[arg ? `${name}:${arg.trim()}` : name];
    case "start":
      return instance.start.format(arg || DAY);
    case "end":
      return instance.end.format(arg || DAY);
    case "end?":
      return different(instance.start, instance.end, arg || DAY);
    case "fy":
      return instance.year?.start.format(arg || DAY);
    case "fyend":
      return instance.year?.end.format(arg || DAY);
  }
  return undefined;
}

// The last day, or nothing where the first day looks the same in that
// format. {{end?:-YY}} adds -27 to a winter that starts in 2026, and
// nothing to an autumn.
function different(start: Moment, end: Moment, format: string) {
  const last = end.format(format);
  return start.format(format) === last ? "" : last;
}

export interface Rendered {
  text: string;
  errors: string[];
}

// A note's name: moment formats the period's first day, after Zhami's tokens
// are put in as literal text. Tokens work inside moment's [brackets] too.
export function render(format: string, period: Period, instance: Instance): Rendered {
  const errors: string[] = [];
  let out = "";
  let literal = false;
  let i = 0;
  while (i < format.length) {
    TOKEN.lastIndex = i;
    const match = format.startsWith("{{", i) ? TOKEN.exec(format) : null;
    if (match && match.index === i) {
      const [whole, name, arg] = match;
      const v = value(name!, arg, instance);
      if (v === undefined) errors.push(`${whole} isn't a token for ${period.name.toLowerCase()}s`);
      const text = (v ?? whole).replace(/[[\]]/g, "");
      out += literal ? text : `[${text}]`;
      i += whole.length;
      continue;
    }
    const c = format[i]!;
    if (c === "[") literal = true;
    else if (c === "]") literal = false;
    out += c;
    i++;
  }
  return { text: instance.start.format(out), errors };
}

// Template variables: the core Templates plugin's {{title}}, {{date}} and
// {{time}}, plus every token above. Unknown variables stay as they are, so
// other plugins can fill them.
export function fill(text: string, title: string, now: Moment, instance: Instance) {
  return text.replace(TOKEN, (whole, name: string, arg?: string) => {
    const f = arg?.trim();
    if (name === "title") return title;
    if (name === "date") return now.format(f || DAY);
    if (name === "time") return now.format(f || "HH:mm");
    return value(name, arg, instance) ?? whole;
  });
}
