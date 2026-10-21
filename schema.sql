-- =====================================================================
--  رِفْق v1 — قاعدة البيانات الآمنة
--  شغّله كاملاً في: Supabase ← SQL Editor ← New query ← Run
--  آمن لإعادة التشغيل أكثر من مرة، وينقل بيانات نسخة Gemini القديمة إن وُجدت.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) إزالة نسخة Gemini القديمة (رمز 1234 + دوال الرمز السري)
-- ---------------------------------------------------------------------
drop function if exists teacher_get_students(text);
drop function if exists teacher_add_student(text, text, text);
drop function if exists teacher_save_session(text, date, jsonb);
drop function if exists teacher_update_student(text, uuid, text, text);
drop function if exists teacher_delete_student(text, uuid);
drop function if exists parent_get_history(text);
drop table if exists rifq_settings;

-- إن كان جدول الحصص بالشكل القديم (عمود status) نحفظه باسم rifq_sessions_old
do $mig$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'rifq_sessions' and column_name = 'status') then
    execute 'alter table rifq_sessions rename to rifq_sessions_old';
    if exists (select 1 from pg_constraint
               where conname = 'rifq_sessions_pkey' and conrelid = 'public.rifq_sessions_old'::regclass) then
      execute 'alter table rifq_sessions_old rename constraint rifq_sessions_pkey to rifq_sessions_old_pkey';
    end if;
  end if;
end $mig$;

-- ---------------------------------------------------------------------
-- 1) دوال مساعدة
-- ---------------------------------------------------------------------
-- رمز ولي عشوائي طويل (48 بت) من مولّد آمن
create or replace function rifq_gen_code() returns text
language sql volatile
as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)) $$;

-- الأستاذ المسجَّل (حساب Supabase Auth واحد)
create table if not exists rifq_teacher (
  user_id uuid primary key
);

create or replace function rifq_is_teacher() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from rifq_teacher where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------------
-- 2) الجداول
-- ---------------------------------------------------------------------
create table if not exists rifq_students (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null default '',
  code         text not null unique default rifq_gen_code(),
  monthly_goal int  not null default 20,
  created_at   timestamptz not null default now()
);
alter table rifq_students add column if not exists monthly_goal int not null default 20;
alter table rifq_students alter column code set default rifq_gen_code();
alter table rifq_students drop constraint if exists rifq_students_name_len;
alter table rifq_students add  constraint rifq_students_name_len  check (char_length(btrim(name)) between 1 and 80);
alter table rifq_students drop constraint if exists rifq_students_phone_len;
alter table rifq_students add  constraint rifq_students_phone_len check (char_length(phone) <= 25);
alter table rifq_students drop constraint if exists rifq_students_goal_rng;
alter table rifq_students add  constraint rifq_students_goal_rng  check (monthly_goal between 1 and 500);

-- سلّم النقاط (يمكن تعديله من Table Editor). الغياب بلا نقاط فلا يُحتسب.
create table if not exists rifq_scale (
  recitation text primary key check (recitation in ('excellent', 'recited', 'not_recited')),
  points     int  not null
);
insert into rifq_scale (recitation, points) values
  ('excellent', 3), ('recited', 1), ('not_recited', 0)
on conflict (recitation) do nothing;

-- إعدادات عامة يتحكم بها الأستاذ (لوحة الصدارة للأولياء: مطفأة افتراضياً)
create table if not exists rifq_config (
  key   text primary key,
  value text not null,
  check (
    (key = 'leaderboard_enabled' and value in ('on', 'off'))
    or (key = 'leaderboard_top' and case when value ~ '^[0-9]{1,2}$' then value::int between 1 and 20 else false end)
  )
);
insert into rifq_config (key, value) values ('leaderboard_enabled', 'off'), ('leaderboard_top', '5')
on conflict (key) do nothing;

-- recitation: excellent=استظهر بحفظ ممتاز · recited=استظهر · not_recited=لم يستظهر · absent=غائب
-- behavior:   good=جيد · fine=حسن · average=متوسط
create table if not exists rifq_sessions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references rifq_students(id) on delete cascade,
  session_date date not null,
  recitation   text check (recitation in ('excellent', 'recited', 'not_recited', 'absent')),
  behavior     text check (behavior in ('good', 'fine', 'average')),
  note         text not null default '' check (char_length(note) <= 300),          -- يظهر للولي
  private_note text not null default '' check (char_length(private_note) <= 500),  -- للأستاذ فقط
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (student_id, session_date),
  check (recitation is not null or behavior is not null)
);
create index if not exists rifq_sessions_date_idx on rifq_sessions (session_date);

-- سجل التعديلات: كل تغيير على تقييم محفوظ تبقى قيمته القديمة هنا
create table if not exists rifq_session_log (
  id               bigint generated always as identity primary key,
  session_id       uuid not null,
  student_id       uuid not null references rifq_students(id) on delete cascade,
  session_date     date not null,
  old_recitation   text,
  old_behavior     text,
  old_note         text,
  old_private_note text,
  changed_at       timestamptz not null default now()
);

create or replace function rifq_session_audit() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.recitation   is distinct from new.recitation
  or old.behavior     is distinct from new.behavior
  or old.note         is distinct from new.note
  or old.private_note is distinct from new.private_note then
    insert into rifq_session_log
      (session_id, student_id, session_date, old_recitation, old_behavior, old_note, old_private_note)
    values
      (old.id, old.student_id, old.session_date, old.recitation, old.behavior, old.note, old.private_note);
  end if;
  new.updated_at := clock_timestamp();
  return new;
end $$;

drop trigger if exists rifq_sessions_audit on rifq_sessions;
create trigger rifq_sessions_audit before update on rifq_sessions
  for each row execute function rifq_session_audit();

-- ---------------------------------------------------------------------
-- 3) نقل بيانات النسخة القديمة (إن وُجدت) إلى الشكل الجديد
-- ---------------------------------------------------------------------
do $mig2$
begin
  if to_regclass('public.rifq_sessions_old') is not null
     and not exists (select 1 from rifq_sessions) then
    insert into rifq_sessions (student_id, session_date, recitation, behavior, note, created_at, updated_at)
    select distinct on (o.student_id, o.session_date)
           o.student_id, o.session_date,
           case o.status when 'استظهر بحفظ ممتاز' then 'excellent' when 'استظهر' then 'recited'
                         when 'لم يستظهر' then 'not_recited' when 'غائب' then 'absent' end,
           case o.behavior when 'جيد' then 'good' when 'حسن' then 'fine' when 'متوسط' then 'average' end,
           left(coalesce(o.note, ''), 300), o.created_at, o.created_at
    from rifq_sessions_old o
    where o.student_id is not null
      and (o.status in ('استظهر بحفظ ممتاز', 'استظهر', 'لم يستظهر', 'غائب')
           or o.behavior in ('جيد', 'حسن', 'متوسط'))
    order by o.student_id, o.session_date, o.created_at desc;
  end if;
end $mig2$;

-- ⚠️ يولّد رموزاً جديدة طويلة للتلاميذ الذين رموزهم قصيرة (الروابط القديمة تتوقف).
-- إن كنت وزّعت روابط حقيقية على أولياء وتريد إبقاءها، احذف السطر التالي (لكن الرموز القصيرة أضعف).
update rifq_students set code = rifq_gen_code() where char_length(code) < 12;

-- ---------------------------------------------------------------------
-- 4) الإغلاق: لا أحد يصل للجداول مباشرة إلا الأستاذ (RLS + صلاحيات صريحة)
-- ---------------------------------------------------------------------
alter table rifq_teacher     enable row level security;
alter table rifq_students    enable row level security;
alter table rifq_sessions    enable row level security;
alter table rifq_scale       enable row level security;
alter table rifq_session_log enable row level security;
alter table rifq_config      enable row level security;

revoke all on rifq_teacher, rifq_students, rifq_sessions, rifq_scale, rifq_session_log, rifq_config
  from public, anon, authenticated;

do $lock$
begin
  if to_regclass('public.rifq_sessions_old') is not null then
    execute 'alter table rifq_sessions_old enable row level security';
    execute 'revoke all on rifq_sessions_old from public, anon, authenticated';
  end if;
end $lock$;

grant select, insert, update, delete on rifq_students, rifq_sessions to authenticated;
grant select, update                 on rifq_scale                    to authenticated;
grant select                         on rifq_session_log              to authenticated;
grant select, insert, update          on rifq_config                   to authenticated;

drop policy if exists teacher_all on rifq_students;
create policy teacher_all on rifq_students for all to authenticated
  using ((select rifq_is_teacher())) with check ((select rifq_is_teacher()));

drop policy if exists teacher_all on rifq_sessions;
create policy teacher_all on rifq_sessions for all to authenticated
  using ((select rifq_is_teacher())) with check ((select rifq_is_teacher()));

drop policy if exists teacher_all on rifq_scale;
create policy teacher_all on rifq_scale for all to authenticated
  using ((select rifq_is_teacher())) with check ((select rifq_is_teacher()));

drop policy if exists teacher_all on rifq_config;
create policy teacher_all on rifq_config for all to authenticated
  using ((select rifq_is_teacher())) with check ((select rifq_is_teacher()));

drop policy if exists teacher_read on rifq_session_log;
create policy teacher_read on rifq_session_log for select to authenticated
  using ((select rifq_is_teacher()));

-- ---------------------------------------------------------------------
-- 5) الدوال المعروضة للتطبيق
-- ---------------------------------------------------------------------

-- (أ) الولي: يرسل رمز ابنه فقط ← يستلم بيانات ابنه فقط (دون الهاتف ودون الملاحظات الخاصة)
create or replace function parent_get_history(p_code text) returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v         rifq_students%rowtype;
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_start   date := date_trunc('month', now() at time zone 'Africa/Algiers')::date;
  v_end     date := (date_trunc('month', now() at time zone 'Africa/Algiers') + interval '1 month')::date;
begin
  if char_length(v_code) < 6 then
    raise exception 'رمز المتابعة غير صحيح';
  end if;
  select * into v from rifq_students where code = v_code;
  if not found then
    raise exception 'رمز المتابعة غير صحيح';
  end if;

  return json_build_object(
    'name', v.name,
    'monthly_goal', v.monthly_goal,
    'month_points', (select coalesce(sum(sc.points), 0)
                     from rifq_sessions s join rifq_scale sc on sc.recitation = s.recitation
                     where s.student_id = v.id and s.session_date >= v_start and s.session_date < v_end),
    'total_points', (select coalesce(sum(sc.points), 0)
                     from rifq_sessions s join rifq_scale sc on sc.recitation = s.recitation
                     where s.student_id = v.id),
    'month_conduct', (select json_build_object(
                        'good',    count(*) filter (where behavior = 'good'),
                        'fine',    count(*) filter (where behavior = 'fine'),
                        'average', count(*) filter (where behavior = 'average'))
                      from rifq_sessions
                      where student_id = v.id and session_date >= v_start and session_date < v_end),
    'history', (select coalesce(json_agg(h order by h.date desc), '[]'::json)
                from (select s.session_date as date, s.recitation, s.behavior, sc.points, s.note
                      from rifq_sessions s left join rifq_scale sc on sc.recitation = s.recitation
                      where s.student_id = v.id
                      order by s.session_date desc
                      limit 120) h)
  );
end $$;

-- (أ-2) تطبيق الولي: كل ما تحتاجه الصفحات الثلاث في استدعاء واحد.
--  • الولي يرى ابنه فقط. لوحة الصدارة: أسماء الأوائل علناً، أما المجاورون لابنه
--    فيُرسَل إليه ترتيبهم ونقاطهم دون أي اسم (الإخفاء من الخادم، لا بـ CSS).
--  • لا يُرسَل الرمز الكامل ولا الهاتف ولا الملاحظات الخاصة.
create or replace function parent_get_app(p_code text) returns json
language plpgsql stable security definer set search_path = public
as $$
declare
  v         rifq_students%rowtype;
  v_code    text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_start   date := date_trunc('month', now() at time zone 'Africa/Algiers')::date;
  v_end     date := (date_trunc('month', now() at time zone 'Africa/Algiers') + interval '1 month')::date;
  v_enabled boolean := coalesce((select value from rifq_config where key = 'leaderboard_enabled'), 'off') = 'on';
  v_top     int := coalesce((select value::int from rifq_config where key = 'leaderboard_top'), 5);
  v_stats   json;
  v_lb      json := json_build_object('enabled', false);
begin
  if char_length(v_code) < 6 then
    raise exception 'رمز المتابعة غير صحيح';
  end if;
  select * into v from rifq_students where code = v_code;
  if not found then
    raise exception 'رمز المتابعة غير صحيح';
  end if;

  select json_build_object(
    'name', v.name,
    'code_hint', right(v.code, 4),
    'monthly_goal', v.monthly_goal,
    'month_start', v_start,
    'month_points', coalesce(sum(sc.points) filter (where s.session_date >= v_start and s.session_date < v_end), 0),
    'total_points', coalesce(sum(sc.points), 0),
    'month_sessions', count(s.id) filter (where s.session_date >= v_start and s.session_date < v_end),
    'total_sessions', count(s.id),
    'mastery_pct', round(100.0 * count(s.id) filter (where s.recitation = 'excellent')
                         / nullif(count(s.id) filter (where s.recitation in ('excellent', 'recited', 'not_recited')), 0)),
    'attendance_pct', round(100.0 * count(s.id) filter (where s.recitation is distinct from 'absent')
                            / nullif(count(s.id), 0)),
    'conduct', json_build_object(
        'good',    count(s.id) filter (where s.behavior = 'good'    and s.session_date >= v_start and s.session_date < v_end),
        'fine',    count(s.id) filter (where s.behavior = 'fine'    and s.session_date >= v_start and s.session_date < v_end),
        'average', count(s.id) filter (where s.behavior = 'average' and s.session_date >= v_start and s.session_date < v_end))
  ) into v_stats
  from rifq_sessions s left join rifq_scale sc on sc.recitation = s.recitation
  where s.student_id = v.id;

  if v_enabled then
    with pts as (
      select st.id, st.name,
             coalesce(sum(sc.points) filter (where s.session_date >= v_start and s.session_date < v_end), 0)::int as p
      from rifq_students st
      left join rifq_sessions s on s.student_id = st.id
      left join rifq_scale sc on sc.recitation = s.recitation
      group by st.id, st.name
    ), ranked as (
      select id, name, p, rank() over (order by p desc)::int as r from pts where p > 0
    ), me as (
      select r, p from ranked where id = v.id
    ), above as (
      select r, p, count(*)::int as n from ranked
      where p = (select min(p) from ranked where p > (select p from me)) group by r, p
    ), below as (
      select r, p, count(*)::int as n from ranked
      where p = (select max(p) from ranked where p < (select p from me)) group by r, p
    )
    select json_build_object(
      'enabled', true,
      'top_n', v_top,
      'ranked', (select count(*) from ranked),
      'me', (select json_build_object('rank', r, 'points', p) from me),
      'top', coalesce((select json_agg(json_build_object('rank', r, 'name', name, 'points', p, 'is_me', id = v.id) order by r, name)
                       from ranked where r <= v_top), '[]'::json),
      'above', (select json_build_object('rank', r, 'points', p, 'count', n) from above),
      'below', (select json_build_object('rank', r, 'points', p, 'count', n) from below)
    ) into v_lb;
  end if;

  return json_build_object(
    'student', v_stats,
    'last_note', (select json_build_object('date', session_date, 'text', note)
                  from rifq_sessions where student_id = v.id and btrim(note) <> ''
                  order by session_date desc limit 1),
    'history', (select coalesce(json_agg(h order by h.date desc), '[]'::json)
                from (select s.session_date as date, s.recitation, s.behavior, sc.points, s.note
                      from rifq_sessions s left join rifq_scale sc on sc.recitation = s.recitation
                      where s.student_id = v.id order by s.session_date desc limit 120) h),
    'leaderboard', v_lb
  );
end $$;

-- (ب) الأستاذ: ملخص الشهر لكل تلميذ (يعمل بصلاحيات المستدعي، فيحميه RLS)
create or replace function teacher_overview()
returns table (student_id uuid, month_points bigint, total_points bigint,
               good int, fine int, average int, sessions_month int)
language plpgsql stable set search_path = public
as $$
declare
  v_start date := date_trunc('month', now() at time zone 'Africa/Algiers')::date;
  v_end   date := (date_trunc('month', now() at time zone 'Africa/Algiers') + interval '1 month')::date;
begin
  if not rifq_is_teacher() then
    raise exception 'غير مصرّح';
  end if;
  return query
  select st.id,
         coalesce(sum(sc.points) filter (where s.session_date >= v_start and s.session_date < v_end), 0)::bigint,
         coalesce(sum(sc.points), 0)::bigint,
         (count(*) filter (where s.behavior = 'good'    and s.session_date >= v_start and s.session_date < v_end))::int,
         (count(*) filter (where s.behavior = 'fine'    and s.session_date >= v_start and s.session_date < v_end))::int,
         (count(*) filter (where s.behavior = 'average' and s.session_date >= v_start and s.session_date < v_end))::int,
         (count(s.id) filter (where s.session_date >= v_start and s.session_date < v_end))::int
  from rifq_students st
  left join rifq_sessions s on s.student_id = st.id
  left join rifq_scale sc on sc.recitation = s.recitation
  group by st.id;
end $$;

-- (ج) نبضة تبقي المشروع نشطاً (يستدعيها GitHub Actions أسبوعياً)
create or replace function rifq_ping() returns json
language sql stable
as $$ select json_build_object('ok', true, 'at', now()) $$;

-- (د) ربط حساب الأستاذ (يُشغَّل مرة واحدة من SQL Editor فقط، لا يظهر للتطبيق)
create or replace function rifq_register_teacher(p_email text) returns text
language plpgsql security definer set search_path = public, auth
as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'لم أجد مستخدماً بهذا البريد. أنشئه أولاً من Authentication ← Users ثم أعد تشغيل هذا السطر';
  end if;
  insert into rifq_teacher (user_id) values (v_id) on conflict do nothing;
  return 'تم تسجيل الأستاذ: ' || btrim(p_email);
end $$;

-- ---------------------------------------------------------------------
-- 6) صلاحيات تنفيذ الدوال (صريحة، فتعمل مع النظام القديم والجديد في Supabase)
-- ---------------------------------------------------------------------
revoke all on function rifq_gen_code(), rifq_is_teacher(), rifq_session_audit(),
                       parent_get_history(text), parent_get_app(text), teacher_overview(), rifq_ping(),
                       rifq_register_teacher(text)
  from public, anon, authenticated;

grant execute on function parent_get_history(text) to anon, authenticated;
grant execute on function parent_get_app(text)     to anon, authenticated;
grant execute on function rifq_ping()              to anon, authenticated;
grant execute on function rifq_gen_code()          to authenticated;
grant execute on function rifq_is_teacher()        to authenticated;
grant execute on function teacher_overview()       to authenticated;

select 'تم إعداد قاعدة بيانات رِفْق بنجاح ✓' as result;
