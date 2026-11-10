> zhami /ʒɑːmi/ *noun*
>
> time; an era.

Zhami opens the note for this week, this quarter, or this year, and creates it from a template if it doesn't exist yet.

It adds three commands:

- **Open this week**, e.g. `2026-W46`
- **Open this quarter**, e.g. `2026-Q4`
- **Open this year**, e.g. `2026`

For daily notes, use Obsidian's core Daily notes plugin.

Zhami (ჟამი) is a literary Georgian word for time, or an era.

## Settings

- **Folder** for new notes.
- **Name format** for each period, in the same [Moment.js syntax](https://momentjs.com/docs/#/displaying/format/) as Daily notes. Weeks default to ISO weeks, which start on Monday. A slash creates subfolders, e.g. `YYYY/[W]WW`.
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
