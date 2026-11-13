import type { Moment } from "moment";

// Obsidian ships moment, and plugins must use its copy so locale settings
// apply. Tests pass in the moment package instead.
type Factory = (input?: string | number | Date, format?: string, strict?: boolean) => Moment;

let factory: Factory | undefined;

export function useMoment(m: unknown) {
  factory = m as Factory;
}

export function moment(input?: string | number | Date, format?: string, strict?: boolean): Moment {
  if (!factory) throw new Error("Zhami: useMoment() was not called");
  return input === undefined ? factory() : factory(input, format, strict);
}

// A date like 2026-11-13, at the start of that day in local time.
export const day = (date: string) => moment(date, "YYYY-MM-DD", true);
