# Name formats

A name format turns a period into a note's name. Every example on this page is for November 13, 2026.

Each period's settings show today's note as you type, and list every token it understands with what each gives today. [Periods](periods.md) has the same lists.

## Moment

Formats use [moment](https://momentjs.com/docs/#/displaying/format/), as Obsidian's Daily notes do. Moment formats the period's first day.

| Format       | Gives           |
| ------------ | --------------- |
| `YYYY-MM`    | `2026-11`       |
| `MMMM YYYY`  | `November 2026` |
| `MMM YY`     | `Nov 26`        |
| `GGGG-[W]WW` | `2026-W46`      |
| `YYYY-[Q]Q`  | `2026-Q4`       |

Text in square brackets stays as it is: `[Week] W` gives `Week 46`. Without brackets, moment reads every letter it knows: `Week` gives `461124`.

For weeks, use `GGGG`, the ISO year, instead of `YYYY`. December 29, 2025 belongs to 2026's first week.

## Zhami's tokens

Moment knows weeks, months, quarters and years. For other periods, Zhami adds tokens in double braces. Only Zhami reads inside the braces, so its letters never clash with moment's.

| Token            | Means                   | Gives                          |
| ---------------- | ----------------------- | ------------------------------ |
| `{{P}}`          | Number                  | `23`, for the fortnight        |
| `{{Po}}`         | Number, as an ordinal   | `21st`, for the century        |
| `{{PP}}`         | Number, with two digits | `03`, for February's fortnight |
| `{{PPP}}`        | Short name              | `Aut`, for the season          |
| `{{PPPP}}`       | Name                    | `Autumn`, for the season       |
| `{{PPPP:kanji}}` | Name, in another form   | `立冬`, for the sekki          |

P is for period. The letters follow moment's pattern: one for a number, `o` for an ordinal, two for two digits, three for a short name, four for a name.

Each period has only the tokens that make sense for it. Where moment has a token, Zhami doesn't add one: a quarter uses `Q`, not `{{P}}`. A token a period doesn't have shows an error under the name format.

Tokens also work inside brackets: `[F{{PP}} of] GGGG` gives `F23 of 2026`.

## Days and years

Every period has these:

| Token       | Means                                        | Gives        |
| ----------- | -------------------------------------------- | ------------ |
| `{{start}}` | First day                                    | `2026-11-09` |
| `{{end}}`   | Last day                                     | `2026-11-15` |
| `{{years}}` | Year, or both years when it crosses New Year | `2026`       |

`{{start}}` and `{{end}}` take any moment format after a colon:

| Token                       | Gives      |
| --------------------------- | ---------- |
| `{{start:MMM D}}`           | `Nov 9`    |
| `{{end:dddd}}`              | `Sunday`   |
| `{{start:MMM D}}–{{end:D}}` | `Nov 9–15` |

`{{years}}` takes two year formats with what goes between them. It shows both years only when a period crosses New Year, like winter:

| Token                 | Autumn 2026 | Winter 2026-27 |
| --------------------- | ----------- | -------------- |
| `{{years}}`           | `2026`      | `2026-27`      |
| `{{years:YY-YY}}`     | `26`        | `26-27`        |
| `{{years:YYYY–YYYY}}` | `2026`      | `2026–2027`    |

## Folders

A slash makes subfolders: `GGGG/[W]WW` puts this week's note in `2026/W46`. Zhami creates the folders it needs.

## Changing a format

Existing notes keep their names, and the next note gets the new one. To rename the old ones, use [Rename notes](renaming.md).
