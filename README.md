# School Stationery & Fee Management System

A production-ready school administration system built with **Next.js (App Router)**,
**TypeScript**, **Tailwind CSS** and **Supabase (PostgreSQL)**.

It covers three jobs a Nigerian school office actually has to do every term:
track which stationery each child has collected, keep the roster and move it up a
year, and collect fees against a ledger that never loses an outstanding balance.

---

## What it does

### 1. Section-based stationery tracking

- Four sections — **Nursery, Primary, Junior Secondary, Senior Secondary** — each
  with its own stationery catalogue.
- Fifteen classes: Pre-Nursery, Nursery 1–3, Primary 1–5, JSS 1–3, SS 1–3.
- **Class matrix view** — students down the rows, items across the columns. An
  issued item shows a green check (✓); one that has not been collected shows a
  dash (—). Per-column tallies show how far each item has been distributed.
- **Student drawer** — clicking a student opens a slide-over with a **Select All**
  master checkbox (with a true indeterminate state) plus one checkbox per item.
  Nothing is written until *Save*, and the save replaces the student's whole set
  in one transaction.

### 2. Student management & roster engine

- **Bulk CSV / Excel import** with flexible header matching (`Surname`,
  `Last Name` and `last_name` all map to the same field), Excel serial-date and
  `dd/mm/yyyy` normalisation, per-row validation, and a preview showing exactly
  what will be created before anything is written.
- **Single-student registration**, which also opens that student's ledger for the
  current term when their class has a published fee structure.
- **Whole-class promotion** — every student in class *N* moves to *N + 1* by
  `promotion_order`, and any uncleared balance rolls into the next term as
  arrears. The terminal class (SS 3) graduates instead of moving.
- **Soft deletion** — archived students drop off rosters but keep their ledger and
  receipts, and can be restored.

### 3. Dual-ledger fee management

- Fee structures configured **per class, per term**; publishing one applies it
  across that class's ledger.
- Each ledger row carries two legs — `arrears` (carried forward) and
  `current_bill` (this term) — with `balance` as a generated column, so it can
  never drift from `arrears + current_bill - total_paid`.
- **Payment modal with live arithmetic**: paying ₦20,000 against a ₦200,000
  balance shows ₦180,000 remaining *as you type*, before submitting.
- **Instant receipt generator** — a print-ready 80 mm thermal-style receipt with
  the school name, student details, amount paid, outstanding balance, date and
  receipt ID, plus **Print / Save PDF** and **Share on WhatsApp** buttons.
  Receipts are reprintable from the student's payment history.

---

## Architecture

```
src/
  app/
    (app)/                  Authenticated shell: dashboard, stationery, students, fees, promotions
    login/                  Sign-in
    globals.css             Tailwind layers + the print rules that drive the receipt
  components/
    ui/                     Button, fields, modal/drawer, toasts, primitives
    stationery/             Class matrix + student drawer
    students/               Registration form, roster table, import wizard
    fees/                   Ledger table, payment modal, receipt, payment history
    promotions/             Promotion panel
  lib/
    supabase/               Browser, server and middleware clients
    types/database.ts       The typed database contract
    roster/import.ts        CSV / Excel parsing and validation
    format.ts               Naira, date and enum formatting
  server/
    queries.ts              Read-side data access (React-cached, one query per request)
    actions/                Server actions — the only write path
supabase/
  migrations/               Schema, transactional functions, RLS, seed data
  tests/                    Executable SQL test suite (see below)
```

### Design decisions worth knowing

**Writes go through database functions, not the client.** `record_fee_payment`,
`promote_class`, `set_student_stationery` and `bulk_import_students` each take the
locks they need and either complete or raise. A failed request can never leave a
payment without a receipt, or a promotion half-applied.

**The ledger cannot be corrupted by arithmetic.** `balance` is a generated column;
a check constraint refuses `total_paid > arrears + current_bill`; payments record
`balance_before` / `balance_after`, so a reprinted receipt always shows what the
payer actually saw.

**Payments are voided, never edited.** `void_fee_payment` reverses the ledger and
stamps a reason, keeping the audit trail intact.

**Promotions are idempotent by construction.** A unique index on
`(from_class_id, from_term_id, to_term_id)` means running the same promotion twice
is rejected rather than double-charging arrears.

**Concurrency is handled where it matters.** `record_fee_payment` locks the ledger
row with `SELECT … FOR UPDATE`; `set_student_stationery` uses a transaction-level
advisory lock instead, because row locking on `students` would additionally
require an UPDATE policy — which teachers, who legitimately issue stationery, do
not have.

**Authorisation is enforced twice.** RLS policies gate the tables, and each RPC
also checks the caller's role up front via `require_role`, so a blocked action
reports "you do not have permission" rather than a policy-filtered "not found".

**The class matrix is one query.** `class_stationery_matrix` returns each student
with an array of the items they hold — no N+1 fetching, however wide the class.

---

## Getting started

### 1. Create a Supabase project and apply the migrations

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste `supabase/migrations/*.sql` into the SQL editor, in filename order.

The seed migration creates the four sections, all fifteen classes, a 2026/2027
session with three terms, a starter stationery catalogue, and a fee schedule for
the current term.

### 2. Configure the environment

```bash
cp .env.example .env.local
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only administrative key |
| `NEXT_PUBLIC_SCHOOL_NAME` / `_ADDRESS` / `_PHONE` | Branding printed on receipts |

### 3. Create staff accounts

Add users in the Supabase dashboard. A `profiles` row is created automatically by
the `on_auth_user_created` trigger with the `teacher` role; promote the first
account to `admin`:

```sql
update public.profiles set role = 'admin' where email = 'you@school.edu.ng';
```

| Role | Can do |
| --- | --- |
| `admin` | Everything: roster, imports, promotions, fees, catalogue |
| `bursar` | Fee structures, ledger adjustments, payments, receipts |
| `teacher` | Read the roster and ledgers; issue stationery |

### 4. Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint
```

---

## Database tests

The migrations ship with an executable test suite that runs against plain
PostgreSQL 16 — no Supabase installation needed. See
[`supabase/tests/README.md`](supabase/tests/README.md) for the commands.

It asserts, among other things, that a ₦20,000 payment against a ₦200,000 balance
leaves exactly ₦180,000; that overpayments and cross-section stationery are
rejected; that voiding restores the ledger; that promotion rolls arrears forward
and refuses to run twice; that SS 3 graduates; and that each role can do only what
it should.

---

## Accessibility

- Every form control is label-associated, with errors wired through
  `aria-describedby` and `role="alert"`.
- Modals and drawers trap focus, close on <kbd>Esc</kbd>, restore focus to the
  trigger, and lock background scroll.
- Tables use `<caption>`, scoped headers and row headers; matrix cells carry
  screen-reader text ("Issued" / "Not issued") rather than relying on colour.
- A skip link, visible focus rings throughout, and a `prefers-reduced-motion`
  block that disables every animation.
- Layout is responsive from small phones up, with the matrix's student column
  pinned while items scroll horizontally.
