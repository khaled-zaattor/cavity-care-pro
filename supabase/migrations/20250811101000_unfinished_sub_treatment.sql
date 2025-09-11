-- Add is_completed flag and create unfinished_sub_treatments view

-- 1. Add column to mark completion explicitly
ALTER TABLE public.treatment_records
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT FALSE;

-- 2. View: unfinished sub-treatments for a patient
--    A record is unfinished when:
--      a) treatment_records.is_completed = FALSE OR
--      b) there exists at least one appointment_treatment_steps for the same record whose is_completed = FALSE
--    Note: we compare through sub_treatment_id & appointment_id linkage.
create or replace view public.unfinished_sub_treatments as
select
  tr.*, st.name  as sub_treatment_name, t.name as treatment_name,
  a.patient_id
from treatment_records tr
join sub_treatments st on st.id = tr.sub_treatment_id
join treatments t        on t.id  = tr.treatment_id
join appointments a      on a.id  = tr.appointment_id
left join lateral (
  select exists(
    select 1 from appointment_treatment_steps ats
    where ats.appointment_id = tr.appointment_id
      and ats.sub_treatment_step_id in (
        select id from sub_treatment_steps where sub_treatment_id = tr.sub_treatment_id
      )
      and (ats.is_completed = false or ats.is_completed is null)
  ) as has_incomplete_step
) s on true
where (tr.is_completed = false or tr.is_completed is null) or s.has_incomplete_step;

-- 3. Grant select to anon/authenticated roles if using RLS
-- comment out / adjust as needed
-- grant select on public.unfinished_sub_treatments to anon, authenticated;
