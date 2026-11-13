import type { Moment } from "moment";
import type { Context, Instance, Period } from "./periods";

// Zhami's tokens sit in double braces, so moment never reads them: {{P}} is
// a period's number, {{PPPP}} its name. Everything outside the braces is
// moment's.
const TOKEN = /\{\{\s*([A-Za-z]+)(?::([^{}]*))?\s*\}\}/g;

const DAY = "YYYY-MM-DD";

export function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens > 10 && tens < 14 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// {{years:YYYY-YY}} gives 2026 for a period inside one year and 2026-27 for
// one that crosses New Year: the first year format, the separator, then the
// second year format.
function years(start: Moment, end: Moment, format: string) {
  const parts = /^(Y+)([^Y]+)(Y+)$/.exec(format);
  if (!parts) return start.format(format);
  const [, first, separator, second] = parts;
  if (start.year() === end.year()) return start.format(first);
  return `${start.format(first)}${separator}${end.format(second)}`;
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
    ["{{start}}", "First day"],
    ["{{end}}", "Last day"],
    ["{{years}}", "Year, or both years when it crosses New Year"],
  );
  if (instance.year) rows.push(["{{fy}}", "Fiscal year, or both years when it crosses New Year"]);
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
      return instance.start.format(arg?.trim() || DAY);
    case "end":
      return instance.end.format(arg?.trim() || DAY);
    case "years":
      return years(instance.start, instance.end, arg?.trim() || "YYYY-YY");
    case "fy":
      return instance.year && years(instance.year.start, instance.year.end, arg?.trim() || "YYYY-YY");
  }
  return undefined;
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
