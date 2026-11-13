# Rename notes

When you change a period's name format, existing notes keep their old names. **Rename notes**, at the bottom of each period's settings, renames them to match.

It also works for notes you made by hand, before Zhami or without it.

## How it works

1. **Find** is the format your notes have now. It starts as the current format; change it to the old one.
2. **Rename to** is the format they should have. It starts as the current format.
3. **In folder** is where to look, including subfolders.

The page lists every note that matches, with its new name, before anything changes. Select **Rename** to rename them.

Renaming goes through Obsidian, so links to the notes update when Obsidian's **Automatically update internal links** is on.

## Any text: `*`

A `*` in **Find** matches any text. A `*` in **Rename to** puts it back.

| Find                        | Rename to                | Note                     | Becomes                  |
| --------------------------- | ------------------------ | ------------------------ | ------------------------ |
| `GGGG-[W]WW`                | `GGGG [week] W`          | `2026-W46`               | `2026 week 46`           |
| `GGGG-[W]WW *`              | `GGGG/[W]WW *`           | `2026-W45 trip to Kyoto` | `2026/W45 trip to Kyoto` |
| `* GGGG-[W]WW`              | `GGGG-[W]WW (*)`         | `notes 2026-W46`         | `2026-W46 (notes)`       |
| `{{PPPP}} YYYY{{end?:-YY}}` | `{{PPP}} YY{{end?:-YY}}` | `Winter 2025-26`         | `Win 25-26`              |

File names can't contain `*`, so it never clashes with a real name.

## What it skips

It never overwrites a note. A note is skipped, and listed with the reason, when:

- a note with its new name already exists, or
- another note would get the same new name.

Notes that don't match **Find** are left alone.
