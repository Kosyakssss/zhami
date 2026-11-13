> zhami /ʒɑːmi/ *noun*
>
> time; an era.

Zhami (ჟამი) is a literary Georgian word for time, or an era.

Zhami opens the note for this week, this season, this year, or any other period, and creates it from a template if it doesn't exist yet. Each period you turn on adds three commands, like **Open this week**, **Open next week** and **Open previous week**. Next and previous step from the period note you're looking at, or else from today.

| Group    | Periods                                                                       |
| -------- | ----------------------------------------------------------------------------- |
| Calendar | week, fortnight, month, quarter, half-year, year, decade, century, millennium |
| Seasons  | meteorological, astronomical, the Wheel of the Year                           |
| Work     | fashion season, fiscal year, fiscal quarter, academic year                    |
| Japan    | the 24 sekki, the 72 kō                                                       |
| China    | the 24 jiéqì, the zodiac year                                                 |
| Korea    | the 24 jeolgi                                                                 |
| India    | the six ṛtu                                                                   |

Week, month, quarter and year are on by default. For daily notes, use Obsidian's core Daily notes plugin.

To link to a period's note as you write, type `@` and a phrase: `@next week` gives `[[2026-W47]]`, `@this sekki` gives `[[Rittō 2026]]`, and `@last month` gives `[[2026-10]]`. The list appears once you type the space after `this`, `next` or `last`, so `@today` stays with plugins like [Aloha](https://github.com/kepano/aloha). With [Natural Language Dates](https://github.com/argenos/nldates-obsidian) on, `@` stays with it; use **Insert link to a period note** instead, which works anywhere.

## Usage

Open **Settings → Zhami**. Set a folder for new notes, then open a period to turn it on.

Each period's page has:

- **Folder**, if its notes go somewhere else.
- **Name format**, with today's note as you type.
- **Template** for new notes.
- **Examples**, each with a button to use it.
- **Reference**: every token the period understands, and what each gives today.
- **Rename notes**, for notes named another way.

Name formats use [moment](https://momentjs.com/docs/#/displaying/format/), as Daily notes do. Where moment has no token, Zhami adds one in double braces. On November 13, 2026:

| Period         | Format                      | Gives          |
| -------------- | --------------------------- | -------------- |
| Week           | `GGGG-[W]WW`                | `2026-W46`     |
| Fortnight      | `GGGG-[F]{{PP}}`            | `2026-F23`     |
| Season         | `{{PPPP}} YYYY{{end?:-YY}}` | `Autumn 2026`  |
| Fashion season | `{{PPP}}YY`                 | `FW26`         |
| Sekki          | `{{PPPP}} {{PPPP:kanji}}`   | `Rittō 立冬`   |
| Century        | `{{Po}} [century]`          | `21st century` |

## Documentation

- [Periods](docs/periods.md): every period, its formats and tokens, and sources.
- [Name formats](docs/formats.md): moment, Zhami's tokens, first and last days, folders.
- [Templates](docs/templates.md): variables for new notes.
- [Rename notes](docs/renaming.md): renaming notes to a new format.

## Accuracy

Seasons, sekki, kō, jiéqì, jeolgi and ṛtu start when the sun reaches a longitude. Zhami computes it with VSOP87 and Jean Meeus's methods. From 1901 to 2100, its dates match all 4,800 solar terms in the Hong Kong Observatory's tables, except six that fall within 15 minutes of midnight, where ephemerides disagree on the day. Zodiac years use the Observatory's Lunar New Year dates, so they cover 1901 to 2099.

## Development

```bash
bun install
bun run check   # type check
bun run test    # tests
bun run e2e     # check in real Obsidian, with test/zhami-vault open
bun run build   # build main.js
bun run docs    # write docs/periods.md
VAULT=/path/to/vault bun run dev   # build and copy into a vault
```

## Credits

The icon is ჟ from [Noto Sans Georgian](https://fonts.google.com/noto/specimen/Noto+Sans+Georgian), under the SIL Open Font License 1.1. VSOP87 coefficients via [astronomia](https://github.com/commenthol/astronomia) (MIT). Names and dates come from the sources listed in [Periods](docs/periods.md).
