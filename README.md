# Zhami

Zhami (ჟამი) is an old Georgian literary word for time, or an era.

This Obsidian plugin opens the note for this week, this quarter, or this year. If the note does not exist yet, Zhami creates it from your template.

Daily notes are left to Obsidian's core Daily notes plugin.

## Commands

| Command | Opens |
| --- | --- |
| Open this week | `Calendar/2026-W46.md` |
| Open this quarter | `Calendar/2026-Q4.md` |
| Open this year | `Calendar/2026.md` |

Weeks are ISO weeks. They start on Monday, and a week belongs to the year that holds its Thursday, so 2026-12-31 is in `2026-W53`. File names sort in time order, and stay apart from daily notes (`2026-11-10.md`).

Bind the commands to hotkeys in **Settings → Hotkeys**.

## Settings

- **Folder:** where new notes go. Default: `Calendar`.
- **Week, quarter, and year template:** a path to a note in your vault, such as `Templates/Year-Week template.md`. Leave it empty for a blank note.

## Template variables

Zhami fills the same variables as the core Templates plugin:

- `{{title}}`: the note's name, such as `2026-Q4`.
- `{{date}}` and `{{time}}`: the moment you create the note. Add a format after a colon, such as `{{date:dddd}}`.

It adds two more:

- `{{start}}`: the first day of the period.
- `{{end}}`: the last day of the period.

Both take a format too, such as `{{end:MMMM D}}`. Without one, they write `YYYY-MM-DD`, which Obsidian reads as a date property.

For example, this quarter template:

```markdown
---
created: {{date}}
due: {{end}}
---
# Planned

# Review
```

creates `2026-Q4.md`:

```markdown
---
created: 2026-11-10
due: 2026-12-31
---
# Planned

# Review
```

## Build

Needs [Bun](https://bun.sh).

```sh
bun install
bun run check           # type check
bun run install-vault   # build and copy into ~/Notes
```
