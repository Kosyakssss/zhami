# Templates

Each period can have a template. Zhami copies it into every new note of that period and fills in its variables. The examples are for notes made on November 13, 2026 at 09:30.

## Variables

Templates understand the core Templates plugin's variables:

| Variable        | Means                | Gives        |
| --------------- | -------------------- | ------------ |
| `{{title}}`     | The note's name      | `2026-W46`   |
| `{{date}}`      | Today                | `2026-11-13` |
| `{{date:dddd}}` | Today, in any format | `Friday`     |
| `{{time}}`      | Now                  | `09:30`      |

And every token of [name formats](formats.md), like `{{start}}`, `{{end}}`, `{{years}}`, `{{P}}` and `{{PPPP}}`.

Variables Zhami doesn't know stay as they are, so a template can also hold another plugin's syntax.

## Examples

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
