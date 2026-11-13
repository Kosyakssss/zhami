> zhami /ʒɑːmi/ *noun*
>
> time; an era.

Zhami opens the note for the current period, and creates it from a template if it doesn't exist yet.

Turn on the periods you use. Each one adds a command, like **Open this week**:

| Period | Example | Spans |
| --- | --- | --- |
| Week | `2026-W46` | an ISO week, Monday to Sunday |
| Fortnight | `2026-F23` | two ISO weeks, 1–2, 3–4, and so on |
| Month | `2026-11` | |
| Quarter | `2026-Q4` | |
| Half-year | `2026-H2` | January to June, or July to December |
| Year | `2026` | |
| Decade | `2020s` | 2020 to 2029 |
| Century | `21st century` | 2001 to 2100 |
| Millennium | `3rd millennium` | 2001 to 3000 |

Week, month, quarter, and year are on by default. In a year with 53 ISO weeks, the last fortnight is one week long. For daily notes, use Obsidian's core Daily notes plugin.

Zhami (ჟამი) is a literary Georgian word for time, or an era.

## Settings

- **Folder** for new notes.
- **Name format** for each period, in the same [Moment.js syntax](https://momentjs.com/docs/#/displaying/format/) as Daily notes, applied to the first day of the period. `{n}` is the period's number and `{nth}` its ordinal, like `23` and `23rd`; keep them outside square brackets. A slash creates subfolders, e.g. `YYYY/[W]WW`.
- **Template** for each period.

## Template variables

Templates support the same variables as the core Templates plugin: `{{title}}`, `{{date}}`, `{{time}}`, and `{{date:FORMAT}}`.

Zhami adds two more:

- `{{start}}`: the first day of the period.
- `{{end}}`: the last day of the period.

Both accept a format, e.g. `{{end:MMMM D}}`, and default to `YYYY-MM-DD`. For example, `due: {{end}}` in a quarter template gives a note due on the last day of the quarter.

## Development

```bash
bun install
bun run check   # type check
bun run build   # build main.js
VAULT=/path/to/vault bun run dev   # build and copy into a vault
```
