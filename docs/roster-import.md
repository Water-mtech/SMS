# Favourite Learning Academy — roster import

`favourite-learning-academy-import.csv` is the academy's printed roster,
prepared for a single upload at `/students/import`.

## What was done to it

The printed list records each student's class **in the session it was printed
for**, which has since ended. Every row is therefore promoted one rung up the
ladder in `20250101000003_seed.sql` (`promotion_order + 1`) so the file lands
students in the class they are in **now**:

| Was (as printed) | Imported as | Students |
| --- | --- | --- |
| Pre-Nursery | Nursery 1 | 23 |
| Nursery 1 | Nursery 2 | 35 |
| Nursery 2 | Nursery 3 | 34 |
| Nursery 3 | Primary 1 | 40 |
| Primary 1 | Primary 2 | 49 |
| Primary 2 | Primary 3 | 40 |
| Primary 3 | Primary 4 | 37 |
| Primary 4 | Primary 5 | 28 |
| Primary 5 | JSS 1 | 19 |
| JSS 1 | JSS 2 | 13 |
| JSS 2 | JSS 3 | 16 |
| JSS 3 | SS 1 | 8 |
| SSS1 | SS 2 | 7 |
| | **Total** | **349** |

Pre-Nursery is deliberately left empty — it is filled by the new intake, not by
anyone on this list. No student was in the terminal class (SS 3), so nobody
graduated out of the roster.

The 31 rows in the Islamiyya streams — FASLIL AUWAL (14), Faslu sabi'u (11),
FASLIL-KHAMIS (4), FASLIL RABIU (1), Faslil Sadis (1) — are excluded: those are
not classes on the ladder.

## Why import them already promoted

`promote_class` is for students the system already knows: it rolls an uncleared
balance into the next term's bill and writes a promotion record. These students
have no ledger here yet, so importing them at last session's class and then
promoting would bill each one at their **old** class's rate before moving them.
Importing them straight into their current class bills them correctly the first
time.

## Verified

Run through `normaliseRecords` and `groupRowsByClass`: 349 records, 349 valid,
0 row errors, 0 unknown classes, 0 duplicate or blank admission numbers.

## Known gaps in the source

Carried over verbatim rather than guessed — worth checking after import:

- `DAN FULANI` as an admission number (Zainab Surajo Danfulani).
- `1147` on its own (Ahmad Muhammad Kabir) — the bare prefix every other
  number extends.
- The Primary 5 `FLA` numbers end `/202`, not `/2025`. This is not clipped
  text; only `0494/FLA/2025` is complete in the original.

The printed list carries no gender, date of birth or guardian details, so those
columns are absent and those fields import blank.
