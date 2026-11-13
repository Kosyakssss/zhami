# Templates

Each period can have a template. Zhami copies it into every new note of that period, and fills in its variables.

## Variables

Templates understand the core Templates plugin's variables:

| Variable | Gives |
| --- | --- |
| `{{title}}` | The note's name |
| `{{date}}` | Today, as `YYYY-MM-DD` |
| `{{date:FORMAT}}` | Today, in any moment format |
| `{{time}}` | The time now, as `HH:mm` |

And every token of [name formats](formats.md), like `{{start}}`, `{{end}}`, `{{years}}`, `{{P}}` and `{{PPPP}}`.

Variables Zhami doesn't know stay as they are, so a template can also hold another plugin's syntax.

## Example

A quarter template:

```markdown
---
created: {{date}}
due: {{end}}
---

## Plans for {{start:MMMM}} to {{end:MMMM}}
```

In this quarter's note, it gives:

```markdown
---
created: 2026-11-13
due: 2026-12-31
---

## Plans for October to December
```

A sekki template, with its name in kanji and English:

```markdown
# {{PPPP}} {{PPPP:kanji}}

{{PPPP:english}}, {{start:MMMM D}} to {{end:MMMM D}}.
```

```markdown
# Rittō 立冬

Beginning of winter, November 7 to November 21.
```
