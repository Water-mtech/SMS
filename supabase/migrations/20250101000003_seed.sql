-- =============================================================================
-- Reference data: sections, classes, calendar, stationery catalogue, fees.
-- Safe to re-run; every insert is idempotent.
-- =============================================================================

insert into public.sections (name, slug, display_order) values
  ('Nursery',           'nursery',           1),
  ('Primary',           'primary',           2),
  ('Junior Secondary',  'junior-secondary',  3),
  ('Senior Secondary',  'senior-secondary',  4)
on conflict (slug) do nothing;

insert into public.classes (section_id, name, slug, promotion_order, is_terminal)
select s.id, c.name, c.slug, c.promotion_order, c.is_terminal
from (values
  ('nursery',           'Pre-Nursery', 'pre-nursery',  1::smallint,  false),
  ('nursery',           'Nursery 1',   'nursery-1',    2::smallint,  false),
  ('nursery',           'Nursery 2',   'nursery-2',    3::smallint,  false),
  ('nursery',           'Nursery 3',   'nursery-3',    4::smallint,  false),
  ('primary',           'Primary 1',   'primary-1',    5::smallint,  false),
  ('primary',           'Primary 2',   'primary-2',    6::smallint,  false),
  ('primary',           'Primary 3',   'primary-3',    7::smallint,  false),
  ('primary',           'Primary 4',   'primary-4',    8::smallint,  false),
  ('primary',           'Primary 5',   'primary-5',    9::smallint,  false),
  ('junior-secondary',  'JSS 1',       'jss-1',       10::smallint,  false),
  ('junior-secondary',  'JSS 2',       'jss-2',       11::smallint,  false),
  ('junior-secondary',  'JSS 3',       'jss-3',       12::smallint,  false),
  ('senior-secondary',  'SS 1',        'ss-1',        13::smallint,  false),
  ('senior-secondary',  'SS 2',        'ss-2',        14::smallint,  false),
  ('senior-secondary',  'SS 3',        'ss-3',        15::smallint,  true)
) as c(section_slug, name, slug, promotion_order, is_terminal)
join public.sections s on s.slug = c.section_slug
on conflict (slug) do nothing;

-- Academic calendar -----------------------------------------------------------
insert into public.academic_sessions (name, starts_on, ends_on)
values ('2026/2027', date '2026-09-07', date '2027-07-30')
on conflict (name) do nothing;

insert into public.terms (session_id, label, sequence, starts_on, ends_on, is_current)
select s.id, t.label, t.sequence, t.starts_on, t.ends_on, t.is_current
from (values
  ('first'::public.term_label,  1, date '2026-09-07', date '2026-12-11', true),
  ('second'::public.term_label, 2, date '2027-01-11', date '2027-04-02', false),
  ('third'::public.term_label,  3, date '2027-04-26', date '2027-07-30', false)
) as t(label, sequence, starts_on, ends_on, is_current)
cross join (select id from public.academic_sessions where name = '2026/2027') s
on conflict (sequence) do nothing;

-- Stationery catalogue --------------------------------------------------------
insert into public.stationery_items (section_id, name, description, unit_price, display_order)
select s.id, i.name, i.description, i.unit_price, i.display_order
from (values
  ('nursery',          'Colouring Book',      'A4 themed colouring book',            1500.00, 1::smallint),
  ('nursery',          'Crayons (12 pack)',   'Jumbo wax crayons',                   1200.00, 2::smallint),
  ('nursery',          'Drawing Book',        '40-leaf plain drawing book',           800.00, 3::smallint),
  ('nursery',          'Pencil Set',          'HB pencils with eraser and sharpener', 900.00, 4::smallint),
  ('nursery',          'Play Mat',            'Foam alphabet play mat',              3500.00, 5::smallint),
  ('primary',          '2B Exercise Book',    '80-leaf ruled exercise book',          600.00, 1::smallint),
  ('primary',          'Mathematical Set',    'Standard geometry set',               2500.00, 2::smallint),
  ('primary',          'Ruler (30cm)',        'Transparent plastic ruler',            400.00, 3::smallint),
  ('primary',          'Note Book Pack',      'Pack of five subject notebooks',      3000.00, 4::smallint),
  ('primary',          'School Diary',        'Termly homework diary',               1800.00, 5::smallint),
  ('primary',          'Art Materials',       'Poster colours and brushes',          2200.00, 6::smallint),
  ('junior-secondary', 'Graph Book',          'A4 squared graph book',               1000.00, 1::smallint),
  ('junior-secondary', 'Mathematical Set',    'Advanced geometry set',               3000.00, 2::smallint),
  ('junior-secondary', 'Practical Note Book', 'Basic science practical book',        1200.00, 3::smallint),
  ('junior-secondary', 'Subject Notebooks',   'Pack of ten 80-leaf notebooks',       6000.00, 4::smallint),
  ('junior-secondary', 'Scientific Calculator', 'Non-programmable calculator',       7500.00, 5::smallint),
  ('senior-secondary', 'Scientific Calculator', 'Non-programmable calculator',       7500.00, 1::smallint),
  ('senior-secondary', 'Chemistry Lab Coat',  'White cotton laboratory coat',        6500.00, 2::smallint),
  ('senior-secondary', 'Physics Practical Book', 'A4 practical record book',         1500.00, 3::smallint),
  ('senior-secondary', 'Biology Dissecting Kit', 'Basic dissection instruments',     8000.00, 4::smallint),
  ('senior-secondary', 'Four Figure Table',   'Mathematical tables',                 1200.00, 5::smallint),
  ('senior-secondary', 'Subject Notebooks',   'Pack of twelve 120-leaf notebooks',   9000.00, 6::smallint)
) as i(section_slug, name, description, unit_price, display_order)
join public.sections s on s.slug = i.section_slug
on conflict (section_id, name) do nothing;

-- Fee structure for the current term ------------------------------------------
insert into public.fee_structures (class_id, term_id, amount, description)
select c.id, t.id, f.amount, 'Tuition, levies and stationery'
from (values
  ('pre-nursery', 120000.00), ('nursery-1', 130000.00), ('nursery-2', 130000.00),
  ('nursery-3',   140000.00), ('primary-1', 165000.00), ('primary-2', 165000.00),
  ('primary-3',   175000.00), ('primary-4', 175000.00), ('primary-5', 185000.00),
  ('jss-1',       210000.00), ('jss-2',     210000.00), ('jss-3',     225000.00),
  ('ss-1',        245000.00), ('ss-2',      245000.00), ('ss-3',      265000.00)
) as f(class_slug, amount)
join public.classes c on c.slug = f.class_slug
cross join (select id from public.terms where is_current limit 1) t
on conflict (class_id, term_id) do nothing;
