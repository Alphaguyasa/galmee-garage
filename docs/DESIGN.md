# DESIGN.md: Galmee Garage

Change this file first, then the code.

## Brief

- **Subject:** a small repair yard in Shashamane. A steel tool chest, a pit, parts on open shelves, a paper job book with greasy thumbprints.
- **Audience:** the service desk (opens jobs at the gate, one thumb), mechanics (their own list, often with dirty hands) and the owner (who still owes money).
- **Primary job:** type a plate and get the whole story of that car.

## Colour

| Token | Hex | Role |
| --- | --- | --- |
| `--enamel` | `#14434A` | Dominant. Tool-chest enamel: header bar, primary action. White on it is 10.7:1. |
| `--floor` | `#EEF1F0` | Page background, swept concrete. |
| `--ink` | `#141C1D` | Text. |
| `--rule` | `#D2DAD8` | Borders and hairlines. |
| `--plate` | `#F4C430` | Accent, used only for number plates and the "ready" tag. Ink on it is 11.9:1. |
| `--owed` | `#B42318` | Money owed, errors. 6.6:1 on white. |

Job status is never colour alone: each status has a word and an icon. Money owed always says "owes" beside the figure.

## Type

- **Barlow** (English and Afaan Oromo): drawn from plates and highway signs, compact on a 360 px phone, sturdy in sunlight. Numbers use tabular figures (`.num`).
- **Noto Sans Ethiopic** for Amharic, 400/600.
- Self-hosted with `next/font/local`.
- Scale: 14 / 16 / 20 / 24; the plate field is 28 bold.

## Layout (360 px first)

```
+----------------------------+
| Garage name      [lang][x] |  enamel header
+----------------------------+
| [ 3-AA 12345          🔍 ] |  plate-yellow field, the one bold thing
+----------------------------+
| In the yard (6)            |
| 3-AA 12345  Corolla        |
| Brakes        ⚙ In repair  |
| Abebe          2,400 birr  |
+----------------------------+
|        [ New job ]         |  sticky above tab bar
+----------------------------+
| Plate Work Parts Unpaid More|
+----------------------------+
```

Desktop: sidebar left, job list and plate search share one column, max 64 rem wide.

## The one bold thing

The number plate. The search field and every plate on screen are set like a real plate: black Barlow on plate yellow, hard border, small radius. Everything else stays flat and quiet: hairline rules, no shadows, 6 px corners.

## Reviewed against generic defaults

Not cream and terracotta, not black and acid green, no gradient washes, no ALL-CAPS eyebrows, no identical soft-shadow cards. The yellow appears only on plates and the ready tag so it keeps meaning.
