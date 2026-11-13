import { PERIODS, type Hemisphere } from "./periods";

// Everything per period is keyed by the period's key, like "week".
export interface Settings {
  folder: string;
  hemisphere: Hemisphere;
  enabled: Record<string, boolean>;
  folders: Record<string, string>;
  formats: Record<string, string>;
  templates: Record<string, string>;
  // Start dates, as MM-DD, for fashion seasons, fiscal and academic years.
  dates: Record<string, string>;
}

export const DEFAULTS: Settings = {
  folder: "",
  hemisphere: "north",
  enabled: { week: true, month: true, quarter: true, year: true },
  folders: {},
  formats: {},
  templates: {},
  dates: {},
};

// Saved data, filled in with the defaults and tidied.
export function load(saved: unknown): Settings {
  const data = (saved ?? {}) as Partial<Settings>;
  return tidy({
    folder: data.folder ?? DEFAULTS.folder,
    hemisphere: data.hemisphere ?? DEFAULTS.hemisphere,
    enabled: { ...DEFAULTS.enabled, ...data.enabled },
    folders: { ...data.folders },
    formats: { ...data.formats },
    templates: { ...data.templates },
    dates: { ...data.dates },
  });
}

// Settings keep only what differs from the defaults, so a default that
// changes in a new version reaches everyone who never changed it. Formats
// with tokens from before version 0.2, like {{n}}, are dropped too.
export function tidy(settings: Settings): Settings {
  const keys = new Set(PERIODS.map((p) => p.key));
  const keep = (record: Record<string, string>, drop: (key: string, value: string) => boolean = () => false) => {
    for (const [key, value] of Object.entries(record)) {
      if (!keys.has(key) || !value || drop(key, value)) delete record[key];
    }
  };
  keep(settings.folders);
  keep(settings.templates);
  keep(settings.formats, (key, value) => {
    const period = PERIODS.find((p) => p.key === key)!;
    return value === period.format || /\{\{?\s*(n|nth|season)\s*\}\}?/.test(value);
  });
  for (const key of Object.keys(settings.enabled)) if (!keys.has(key)) delete settings.enabled[key];
  for (const [key, value] of Object.entries(settings.dates)) if (!value) delete settings.dates[key];
  return settings;
}
