# Name formats

A name format turns a period into a note's name. `GGGG-[W]WW` names this week's note `2026-W46`.

Each period's settings show today's note as you type, and list its tokens with what each gives today.

## Moment

Formats use [moment](https://momentjs.com/docs/#/displaying/format/), the same as Obsidian's Daily notes. Moment formats the first day of the period.

| Format | Gives |
| --- | --- |
| `YYYY-MM` | `2026-11` |
| `MMMM YYYY` | `November 2026` |
| `MMM YY` | `Nov 26` |
| `GGGG-[W]WW` | `2026-W46` |
| `YYYY-[Q]Q` | `2026-Q4` |

Text in square brackets stays as it is: `[Week] W` gives `Week 46`. Without brackets, moment reads letters as tokens: `Week` gives `461124`.

For weeks, use `GGGG`, the ISO year, not `YYYY`. December 29, 2025 belongs to 2026's first week.

## Zhami's tokens

Moment knows weeks, months, quarters and years. For everything else, Zhami adds tokens in double braces. Inside the braces, only Zhami reads the letters, so they never clash with moment's.

| Token | Gives | Example |
| --- | --- | --- |
| `{{P}}` | The period's number | `23` for the 23rd fortnight |
| `{{Po}}` | The same, as an ordinal | `21st` for this century |
| `{{PP}}` | The same, with a zero | `05` |
| `{{PPP}}` | A short name | `Aut`, `FW` |
| `{{PPPP}}` | Its name | `Autumn`, `Rittō` |
| `{{PPPP:kanji}}` | Its name in another form | `立冬` |

P is for period. The letters follow moment's pattern: one for a number, `o` for an ordinal, two for a zero, three for short, four for long.

Not every period has every token. Use moment's where it has them: `Q` for a quarter, not `{{P}}`. A token a period doesn't have shows an error under the name format. [Periods](periods.md) lists what each period has.

Tokens work inside brackets too: `[F{{PP}} of] GGGG` gives `F23 of 2026`.

## Dates and years

These work for every period:

| Token | Gives | Example |
| --- | --- | --- |
| `{{start:FORMAT}}` | The first day, in any moment format | `{{start:MMM D}}` gives `Nov 9` |
| `{{end:FORMAT}}` | The last day | `{{end:D}}` gives `15` |
| `{{years:FORMAT}}` | Its year, or both when it crosses New Year | `{{years:YYYY-YY}}` |

`{{years}}` takes two year formats and what goes between them. It shows both years only when the period crosses New Year:

| Format | Autumn | Winter |
| --- | --- | --- |
| `{{PPPP}} {{years}}` | `Autumn 2026` | `Winter 2026-27` |
| `{{PPPP}} {{years:YY-YY}}` | `Autumn 26` | `Winter 26-27` |
| `{{PPPP}} {{years:YYYY–YYYY}}` | `Autumn 2026` | `Winter 2026–2027` |

Without a format, `{{years}}` is `{{years:YYYY-YY}}`, `{{start}}` and `{{end}}` are `YYYY-MM-DD`.

## Folders

A slash in a format makes subfolders: `GGGG/[W]WW` puts this week's note in `2026/W46`. Zhami creates the folders it needs.

## Changing a format

Existing notes keep their names. Zhami creates the next note under the new name. To rename the old ones, use [Rename notes](renaming.md).
