-- Green Zone schema
-- Run once in the Supabase SQL editor for a new project.
-- The app server uses the service role key. Row level security stays on
-- and blocks the anon key from reading student codes or writing tickets.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null unique,
  total_points integer not null default 0 check (total_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  student_code text primary key,
  full_name text not null,
  team_id uuid not null references public.teams (id) on delete restrict
);

-- location_key is the normalized location used to block a second open ticket
-- for the same room (Room 302 and room302 are the same place).
create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete restrict,
  reported_by_student_code text not null references public.students (student_code) on delete restrict,
  location text not null,
  location_key text not null,
  category text not null,
  severity text not null check (severity in ('Low', 'Medium', 'High')),
  points_awarded integer not null check (
    (severity = 'Low' and points_awarded = 10)
    or (severity = 'Medium' and points_awarded = 25)
    or (severity = 'High' and points_awarded = 50)
  ),
  image_url text,
  description text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Verified', 'Fixed', 'Rejected')),
  created_at timestamptz not null default now()
);

create unique index if not exists issue_reports_one_open_per_location
  on public.issue_reports (location_key)
  where status in ('Pending', 'Verified');

create index if not exists issue_reports_status_created_idx
  on public.issue_reports (status, created_at desc);

create index if not exists teams_points_idx
  on public.teams (total_points desc, team_name);

-- A teammate (or another team) can confirm an open ticket once, for 5 points.
create table if not exists public.report_confirmations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.issue_reports (id) on delete cascade,
  student_code text not null references public.students (student_code) on delete restrict,
  team_id uuid not null references public.teams (id) on delete restrict,
  points_awarded integer not null default 5 check (points_awarded = 5),
  created_at timestamptz not null default now(),
  unique (report_id, student_code)
);

alter table public.teams enable row level security;
alter table public.students enable row level security;
alter table public.issue_reports enable row level security;
alter table public.report_confirmations enable row level security;

revoke all on public.teams from anon, authenticated;
revoke all on public.students from anon, authenticated;
revoke all on public.issue_reports from anon, authenticated;
revoke all on public.report_confirmations from anon, authenticated;

grant select, insert, update, delete on public.teams to service_role;
grant select, insert, update, delete on public.students to service_role;
grant select, insert, update, delete on public.issue_reports to service_role;
grant select, insert, update, delete on public.report_confirmations to service_role;

create or replace function public.confirm_report(p_report_id uuid, p_student_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.issue_reports;
  v_student public.students;
  v_team_name text;
begin
  select * into v_report
  from public.issue_reports
  where id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Report not found');
  end if;

  if v_report.status not in ('Pending', 'Verified') then
    return jsonb_build_object('ok', false, 'error', 'This report is no longer open');
  end if;

  select * into v_student
  from public.students
  where student_code = p_student_code;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Student code not found');
  end if;

  if v_report.reported_by_student_code = p_student_code then
    return jsonb_build_object('ok', false, 'error', 'You already filed this report');
  end if;

  begin
    insert into public.report_confirmations (report_id, student_code, team_id, points_awarded)
    values (p_report_id, p_student_code, v_student.team_id, 5);
  exception
    when unique_violation then
      return jsonb_build_object('ok', false, 'error', 'You already confirmed this report');
  end;

  update public.teams
  set total_points = total_points + 5
  where id = v_student.team_id
  returning team_name into v_team_name;

  return jsonb_build_object('ok', true, 'points', 5, 'team_name', v_team_name);
end;
$$;

create or replace function public.approve_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.issue_reports;
  v_team_name text;
begin
  select * into v_report
  from public.issue_reports
  where id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Report not found');
  end if;

  if v_report.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'error', 'Only pending reports can be verified');
  end if;

  update public.issue_reports
  set status = 'Verified'
  where id = p_report_id;

  update public.teams
  set total_points = total_points + v_report.points_awarded
  where id = v_report.team_id
  returning team_name into v_team_name;

  return jsonb_build_object(
    'ok', true,
    'points', v_report.points_awarded,
    'team_name', v_team_name
  );
end;
$$;

create or replace function public.reject_report(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.issue_reports;
begin
  select * into v_report
  from public.issue_reports
  where id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Report not found');
  end if;

  if v_report.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'error', 'Only pending reports can be rejected');
  end if;

  -- Confirmations pay 5 points immediately. A rejection gives those points back.
  update public.teams as team
  set total_points = greatest(0, team.total_points - confirmation.points)
  from (
    select team_id, sum(points_awarded)::integer as points
    from public.report_confirmations
    where report_id = p_report_id
    group by team_id
  ) as confirmation
  where team.id = confirmation.team_id;

  update public.issue_reports
  set status = 'Rejected'
  where id = p_report_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_report_fixed(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report public.issue_reports;
begin
  select * into v_report
  from public.issue_reports
  where id = p_report_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Report not found');
  end if;

  if v_report.status <> 'Verified' then
    return jsonb_build_object('ok', false, 'error', 'Only verified reports can be marked fixed');
  end if;

  update public.issue_reports
  set status = 'Fixed'
  where id = p_report_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.confirm_report(uuid, text) from public, anon, authenticated;
revoke all on function public.approve_report(uuid) from public, anon, authenticated;
revoke all on function public.reject_report(uuid) from public, anon, authenticated;
revoke all on function public.mark_report_fixed(uuid) from public, anon, authenticated;

grant execute on function public.confirm_report(uuid, text) to service_role;
grant execute on function public.approve_report(uuid) to service_role;
grant execute on function public.reject_report(uuid) to service_role;
grant execute on function public.mark_report_fixed(uuid) to service_role;

insert into storage.buckets (id, name, public)
values ('report-images', 'report-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read report images" on storage.objects;
create policy "Public read report images"
on storage.objects
for select
to public
using (bucket_id = 'report-images');

insert into public.teams (id, team_name, total_points) values
  ('11111111-1111-4111-8111-111111111111', 'North Quad', 0),
  ('22222222-2222-4222-8222-222222222222', 'Library Night Shift', 0),
  ('33333333-3333-4333-8333-333333333333', 'East Hall', 0),
  ('44444444-4444-4444-8444-444444444444', 'Science Wing', 0)
on conflict (id) do nothing;

insert into public.students (student_code, full_name, team_id) values
  ('NQ-01', 'Mina Alvarez', '11111111-1111-4111-8111-111111111111'),
  ('NQ-02', 'Jonah Reed', '11111111-1111-4111-8111-111111111111'),
  ('NQ-03', 'Priya Shah', '11111111-1111-4111-8111-111111111111'),
  ('LN-01', 'Chris Dalton', '22222222-2222-4222-8222-222222222222'),
  ('LN-02', 'Hana Ito', '22222222-2222-4222-8222-222222222222'),
  ('LN-03', 'Owen Brooks', '22222222-2222-4222-8222-222222222222'),
  ('EH-01', 'Leila Hassan', '33333333-3333-4333-8333-333333333333'),
  ('EH-02', 'Marco Diaz', '33333333-3333-4333-8333-333333333333'),
  ('EH-03', 'Sable Nguyen', '33333333-3333-4333-8333-333333333333'),
  ('SW-01', 'Aria Cole', '44444444-4444-4444-8444-444444444444'),
  ('SW-02', 'Noah Kim', '44444444-4444-4444-8444-444444444444'),
  ('SW-03', 'Farah Mensah', '44444444-4444-4444-8444-444444444444')
on conflict (student_code) do nothing;
