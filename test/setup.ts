import moment from "moment";
import { render } from "../src/format";
import { useMoment } from "../src/moment";
import { DATE_DEFAULTS, PERIODS, type Context } from "../src/periods";

useMoment(moment);

export const north: Context = { hemisphere: "north", dates: {} };
export const south: Context = { hemisphere: "south", dates: {} };

export const period = (key: string) => {
  const found = PERIODS.find((p) => p.key === key);
  if (!found) throw new Error(`no period ${key}`);
  return found;
};

// The period around a date: its name in a format, and its first and last day.
export function at(key: string, date: string, format?: string, ctx = north) {
  const p = period(key);
  const instance = p.at(moment(date, "YYYY-MM-DD"), ctx);
  const rendered = render(format ?? p.format, p, instance);
  return {
    name: rendered.text,
    errors: rendered.errors,
    start: instance.start.format("YYYY-MM-DD"),
    end: instance.end.format("YYYY-MM-DD"),
    instance,
  };
}

export { DATE_DEFAULTS, moment };
