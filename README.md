# Calendar notes

An Obsidian plugin that opens this week's, quarter's, or year's note, and creates it from a template if it does not exist.

| Command | Note | Template |
|---|---|---|
| Open this week | `Calendar/2026-W46.md` | `Templates/Year-Week template.md` |
| Open this quarter | `Calendar/2026-Q4.md` | `Templates/Year-Quarter template.md` |
| Open this year | `Calendar/2026.md` | `Templates/Year template.md` |

Weeks are ISO weeks, Monday to Sunday.

## Template variables

- `{{title}}`, `{{date}}`, `{{time}}`, and `{{date:FORMAT}}`, as in the core Templates plugin.
- `{{start}}` and `{{end}}`: the first and last day of the period, for example `due: {{end}}`.

## Build

```sh
bun install
bun run check
bun run install-vault   # builds and copies into ~/Notes
```
