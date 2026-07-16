-- POLYGLOT: user profiles, teacher profiles, signup trigger and RLS
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

begin;

do $$
begin
    create type public.user_role as enum ('student', 'teacher');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.teacher_approval_status as enum ('pending', 'approved', 'rejected');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.availability_status as enum ('available', 'booked', 'cancelled');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.lesson_status as enum ('scheduled', 'completed', 'cancelled');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.lesson_credit_source as enum ('free_trial', 'paid_credit');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.lesson_purchase_status as enum ('pending', 'paid', 'failed', 'expired', 'refunded');
exception
    when duplicate_object then null;
end
$$;

do $$
begin
    create type public.lesson_credit_transaction_type as enum ('purchase', 'booking', 'refund', 'admin_adjustment');
exception
    when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null check (char_length(trim(full_name)) between 2 and 80),
    role public.user_role not null default 'student',
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.teacher_profiles (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    headline text not null default '' check (char_length(headline) <= 120),
    bio text not null default '' check (char_length(bio) <= 1500),
    languages text[] not null default '{}',
    native_language text not null default '',
    student_levels text[] not null default '{}',
    teaching_methods text not null default '' check (char_length(teaching_methods) <= 1200),
    experience_years integer check (experience_years is null or experience_years between 0 and 80),
    lesson_duration_minutes integer not null default 60
        check (lesson_duration_minutes in (30, 45, 60, 90)),
    timezone text not null default 'UTC',
    approval_status public.teacher_approval_status not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.student_lesson_balances (
    student_id uuid primary key references public.profiles(id) on delete cascade,
    paid_lessons integer not null default 0 check (paid_lessons >= 0),
    free_trial_used_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.lesson_packages (
    id text primary key,
    name text not null,
    lessons_count integer not null check (lessons_count > 0),
    price_minor integer not null check (price_minor > 0),
    currency text not null default 'uah' check (currency = 'uah'),
    active boolean not null default true,
    display_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.lesson_purchases (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles(id) on delete restrict,
    package_id text not null references public.lesson_packages(id) on delete restrict,
    lesson_count integer not null check (lesson_count > 0),
    amount_minor integer not null check (amount_minor > 0),
    currency text not null check (currency = 'uah'),
    status public.lesson_purchase_status not null default 'pending',
    stripe_checkout_session_id text unique,
    stripe_payment_intent_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    paid_at timestamptz
);

create table if not exists public.teacher_weekly_availability (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
    weekday smallint not null check (weekday between 1 and 7),
    start_time time not null,
    end_time time not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (end_time > start_time),
    unique (teacher_id, weekday)
);

create table if not exists public.teacher_availability (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.teacher_profiles(user_id) on delete cascade,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status public.availability_status not null default 'available',
    created_at timestamptz not null default now(),
    check (ends_at > starts_at),
    unique (teacher_id, starts_at)
);

create table if not exists public.lesson_bookings (
    id uuid primary key default gen_random_uuid(),
    slot_id uuid not null unique references public.teacher_availability(id) on delete restrict,
    student_id uuid not null references public.profiles(id) on delete restrict,
    teacher_id uuid not null references public.teacher_profiles(user_id) on delete restrict,
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    status public.lesson_status not null default 'scheduled',
    credit_source public.lesson_credit_source not null,
    created_at timestamptz not null default now(),
    check (ends_at > starts_at)
);

create table if not exists public.lesson_credit_transactions (
    id uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.profiles(id) on delete restrict,
    transaction_type public.lesson_credit_transaction_type not null,
    lesson_delta integer not null check (lesson_delta <> 0),
    balance_after integer not null check (balance_after >= 0),
    purchase_id uuid unique references public.lesson_purchases(id) on delete restrict,
    booking_id uuid unique references public.lesson_bookings(id) on delete restrict,
    note text,
    created_at timestamptz not null default now()
);

insert into public.lesson_packages (
    id,
    name,
    lessons_count,
    price_minor,
    currency,
    active,
    display_order
)
values
    ('single', '1 lesson', 1, 30000, 'uah', true, 1),
    ('five', '5 lessons', 5, 150000, 'uah', true, 2),
    ('twenty', '20 lessons', 20, 600000, 'uah', true, 3)
on conflict (id) do nothing;

create index if not exists teacher_availability_teacher_time_idx
    on public.teacher_availability (teacher_id, starts_at);
create index if not exists lesson_bookings_student_time_idx
    on public.lesson_bookings (student_id, starts_at);
create index if not exists lesson_bookings_teacher_time_idx
    on public.lesson_bookings (teacher_id, starts_at);
create index if not exists lesson_purchases_student_created_idx
    on public.lesson_purchases (student_id, created_at desc);
create index if not exists lesson_credit_transactions_student_created_idx
    on public.lesson_credit_transactions (student_id, created_at desc);
create unique index if not exists lesson_bookings_one_free_trial_per_student_idx
    on public.lesson_bookings (student_id)
    where credit_source = 'free_trial'::public.lesson_credit_source;

-- Upgrade projects that ran an earlier version of this file.
alter table public.teacher_profiles
    add column if not exists headline text not null default '';
alter table public.teacher_profiles
    add column if not exists native_language text not null default '';
alter table public.teacher_profiles
    add column if not exists student_levels text[] not null default '{}';
alter table public.teacher_profiles
    add column if not exists teaching_methods text not null default '';
alter table public.teacher_profiles
    add column if not exists lesson_duration_minutes integer not null default 60;
alter table public.teacher_profiles
    add column if not exists timezone text not null default 'UTC';

-- Teacher salary is managed privately by the school and is never exposed here.
alter table public.teacher_profiles
    drop column if exists price_per_hour;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row execute procedure public.set_updated_at();

drop trigger if exists teacher_profiles_set_updated_at on public.teacher_profiles;
create trigger teacher_profiles_set_updated_at
    before update on public.teacher_profiles
    for each row execute procedure public.set_updated_at();

drop trigger if exists student_lesson_balances_set_updated_at on public.student_lesson_balances;
create trigger student_lesson_balances_set_updated_at
    before update on public.student_lesson_balances
    for each row execute procedure public.set_updated_at();

drop trigger if exists teacher_weekly_availability_set_updated_at on public.teacher_weekly_availability;
create trigger teacher_weekly_availability_set_updated_at
    before update on public.teacher_weekly_availability
    for each row execute procedure public.set_updated_at();

drop trigger if exists lesson_packages_set_updated_at on public.lesson_packages;
create trigger lesson_packages_set_updated_at
    before update on public.lesson_packages
    for each row execute procedure public.set_updated_at();

drop trigger if exists lesson_purchases_set_updated_at on public.lesson_purchases;
create trigger lesson_purchases_set_updated_at
    before update on public.lesson_purchases
    for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
    selected_role public.user_role;
    selected_name text;
begin
    selected_role := case
        when new.raw_user_meta_data ->> 'role' = 'teacher'
            then 'teacher'::public.user_role
        else 'student'::public.user_role
    end;

    selected_name := coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Polyglot user'
    );

    insert into public.profiles (id, full_name, role)
    values (new.id, selected_name, selected_role)
    on conflict (id) do nothing;

    if selected_role = 'teacher'::public.user_role then
        insert into public.teacher_profiles (user_id)
        values (new.id)
        on conflict (user_id) do nothing;
    else
        insert into public.student_lesson_balances (student_id)
        values (new.id)
        on conflict (student_id) do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- Backfill accounts that were created before this SQL file was installed.
insert into public.profiles (id, full_name, role, created_at, updated_at)
select
    users.id,
    coalesce(
        nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
        nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
        'Polyglot user'
    ),
    case
        when users.raw_user_meta_data ->> 'role' = 'teacher'
            then 'teacher'::public.user_role
        else 'student'::public.user_role
    end,
    users.created_at,
    now()
from auth.users as users
on conflict (id) do nothing;

insert into public.teacher_profiles (user_id)
select profiles.id
from public.profiles as profiles
where profiles.role = 'teacher'::public.user_role
on conflict (user_id) do nothing;

insert into public.student_lesson_balances (student_id)
select profiles.id
from public.profiles as profiles
where profiles.role = 'student'::public.user_role
on conflict (student_id) do nothing;

alter table public.profiles enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.student_lesson_balances enable row level security;
alter table public.lesson_packages enable row level security;
alter table public.lesson_purchases enable row level security;
alter table public.lesson_credit_transactions enable row level security;
alter table public.teacher_weekly_availability enable row level security;
alter table public.teacher_availability enable row level security;
alter table public.lesson_bookings enable row level security;

create or replace function public.is_approved_teacher(profile_id uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
    select exists (
        select 1
        from public.teacher_profiles
        where user_id = profile_id
          and approval_status = 'approved'::public.teacher_approval_status
    );
$$;

revoke all on function public.is_approved_teacher(uuid) from public;
grant execute on function public.is_approved_teacher(uuid) to anon, authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Profiles are visible to their owner and for approved teachers" on public.profiles;
create policy "Profiles are visible to their owner and for approved teachers"
    on public.profiles
    for select
    to anon, authenticated
    using (
        (select auth.uid()) = id
        or public.is_approved_teacher(id)
    );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
    on public.profiles
    for update
    to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

drop policy if exists "Teachers can read their own teacher profile" on public.teacher_profiles;
drop policy if exists "Teacher profiles are visible to their owner or when approved" on public.teacher_profiles;
create policy "Teacher profiles are visible to their owner or when approved"
    on public.teacher_profiles
    for select
    to anon, authenticated
    using (
        (select auth.uid()) = user_id
        or approval_status = 'approved'::public.teacher_approval_status
    );

drop policy if exists "Teachers can update their own teacher profile" on public.teacher_profiles;
create policy "Teachers can update their own teacher profile"
    on public.teacher_profiles
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

-- Public visitors can read approved teachers. Column-level update grants prevent
-- teachers from changing role or approval_status from public JavaScript.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.teacher_profiles from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant update (full_name, avatar_url) on table public.profiles to authenticated;

grant select on table public.teacher_profiles to anon, authenticated;
grant update (
    headline,
    bio,
    languages,
    native_language,
    student_levels,
    teaching_methods,
    experience_years,
    lesson_duration_minutes
)
    on table public.teacher_profiles to authenticated;

drop policy if exists "Students can read their lesson balance" on public.student_lesson_balances;
create policy "Students can read their lesson balance"
    on public.student_lesson_balances
    for select
    to authenticated
    using ((select auth.uid()) = student_id);

drop policy if exists "Active lesson packages are public" on public.lesson_packages;
create policy "Active lesson packages are public"
    on public.lesson_packages
    for select
    to anon, authenticated
    using (active = true);

drop policy if exists "Students can read their own purchases" on public.lesson_purchases;
create policy "Students can read their own purchases"
    on public.lesson_purchases
    for select
    to authenticated
    using ((select auth.uid()) = student_id);

drop policy if exists "Students can read their own lesson transactions" on public.lesson_credit_transactions;
create policy "Students can read their own lesson transactions"
    on public.lesson_credit_transactions
    for select
    to authenticated
    using ((select auth.uid()) = student_id);

drop policy if exists "Teachers can read their weekly availability" on public.teacher_weekly_availability;
create policy "Teachers can read their weekly availability"
    on public.teacher_weekly_availability
    for select
    to authenticated
    using ((select auth.uid()) = teacher_id);

drop policy if exists "Availability is public and teachers can read their own slots" on public.teacher_availability;
create policy "Availability is public and teachers can read their own slots"
    on public.teacher_availability
    for select
    to anon, authenticated
    using (
        (select auth.uid()) = teacher_id
        or (
            status = 'available'::public.availability_status
            and starts_at > now()
            and public.is_approved_teacher(teacher_id)
        )
    );

drop policy if exists "Students and teachers can read their lessons" on public.lesson_bookings;
create policy "Students and teachers can read their lessons"
    on public.lesson_bookings
    for select
    to authenticated
    using (
        (select auth.uid()) = student_id
        or (select auth.uid()) = teacher_id
    );

revoke all on table public.student_lesson_balances from anon, authenticated;
revoke all on table public.lesson_packages from anon, authenticated;
revoke all on table public.lesson_purchases from anon, authenticated;
revoke all on table public.lesson_credit_transactions from anon, authenticated;
revoke all on table public.teacher_weekly_availability from anon, authenticated;
revoke all on table public.teacher_availability from anon, authenticated;
revoke all on table public.lesson_bookings from anon, authenticated;

grant select on table public.student_lesson_balances to authenticated;
grant select on table public.lesson_packages to anon, authenticated;
grant select on table public.lesson_purchases to authenticated;
grant select on table public.lesson_credit_transactions to authenticated;
grant select on table public.teacher_weekly_availability to authenticated;
grant select on table public.teacher_availability to anon, authenticated;
grant select on table public.lesson_bookings to authenticated;

create or replace function public.generate_teacher_slots(
    p_teacher_id uuid,
    p_from_date date,
    p_to_date date
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
    v_duration integer;
    v_duration_interval interval;
    v_timezone text;
    v_rule record;
    v_day date;
    v_candidate time;
    v_slot_start timestamptz;
    v_slot_end timestamptz;
begin
    select lesson_duration_minutes, timezone
    into v_duration, v_timezone
    from public.teacher_profiles
    where user_id = p_teacher_id;

    if not found then
        return;
    end if;

    v_duration_interval := make_interval(mins => v_duration);

    for v_rule in
        select weekday, start_time, end_time
        from public.teacher_weekly_availability
        where teacher_id = p_teacher_id
        order by weekday
    loop
        v_day := p_from_date;

        while v_day <= p_to_date loop
            if extract(isodow from v_day)::smallint = v_rule.weekday then
                v_candidate := v_rule.start_time;

                while v_candidate + v_duration_interval <= v_rule.end_time loop
                    v_slot_start := (v_day + v_candidate) at time zone v_timezone;
                    v_slot_end := v_slot_start + v_duration_interval;

                    if v_slot_start > now() + interval '15 minutes' then
                        insert into public.teacher_availability (
                            teacher_id,
                            starts_at,
                            ends_at,
                            status
                        )
                        values (
                            p_teacher_id,
                            v_slot_start,
                            v_slot_end,
                            'available'::public.availability_status
                        )
                        on conflict (teacher_id, starts_at) do nothing;
                    end if;

                    v_candidate := v_candidate + v_duration_interval;
                end loop;
            end if;

            v_day := v_day + 1;
        end loop;
    end loop;
end;
$$;

create or replace function public.save_teacher_weekly_schedule(
    p_rules jsonb,
    p_timezone text
)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
    v_teacher_id uuid := auth.uid();
    v_duration integer;
    v_rule jsonb;
    v_weekday smallint;
    v_start_time time;
    v_end_time time;
    v_local_today date;
begin
    if v_teacher_id is null then
        raise exception 'Log in before saving your schedule.';
    end if;

    select lesson_duration_minutes
    into v_duration
    from public.teacher_profiles
    where user_id = v_teacher_id;

    if not found then
        raise exception 'Only teacher accounts can save a schedule.';
    end if;

    if p_rules is null or jsonb_typeof(p_rules) <> 'array' then
        raise exception 'The weekly schedule has an invalid format.';
    end if;

    if jsonb_array_length(p_rules) < 1
       or jsonb_array_length(p_rules) > 7 then
        raise exception 'Choose at least one and no more than seven working days.';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_timezone_names
        where name = p_timezone
    ) then
        raise exception 'The selected timezone is not valid.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_teacher_id::text, 0)
    );

    update public.teacher_profiles
    set timezone = p_timezone
    where user_id = v_teacher_id;

    delete from public.teacher_weekly_availability
    where teacher_id = v_teacher_id;

    for v_rule in
        select value
        from jsonb_array_elements(p_rules)
    loop
        v_weekday := (v_rule ->> 'weekday')::smallint;
        v_start_time := (v_rule ->> 'start_time')::time;
        v_end_time := (v_rule ->> 'end_time')::time;

        if v_weekday not between 1 and 7 then
            raise exception 'A weekday must be between Monday and Sunday.';
        end if;

        if v_end_time <= v_start_time then
            raise exception 'The end time must be later than the start time.';
        end if;

        if v_end_time - v_start_time < make_interval(mins => v_duration) then
            raise exception 'Each working period must fit at least one lesson.';
        end if;

        insert into public.teacher_weekly_availability (
            teacher_id,
            weekday,
            start_time,
            end_time
        )
        values (
            v_teacher_id,
            v_weekday,
            v_start_time,
            v_end_time
        );
    end loop;

    delete from public.teacher_availability
    where teacher_id = v_teacher_id
      and starts_at > now()
      and status in (
          'available'::public.availability_status,
          'cancelled'::public.availability_status
      );

    v_local_today := (now() at time zone p_timezone)::date;
    perform public.generate_teacher_slots(
        v_teacher_id,
        v_local_today,
        v_local_today + 83
    );
end;
$$;

create or replace function public.refresh_teacher_availability(p_teacher_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
    v_timezone text;
    v_local_today date;
begin
    if not public.is_approved_teacher(p_teacher_id) then
        return;
    end if;

    select timezone
    into v_timezone
    from public.teacher_profiles
    where user_id = p_teacher_id;

    if not found then
        return;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_teacher_id::text, 0)
    );

    v_local_today := (now() at time zone v_timezone)::date;
    perform public.generate_teacher_slots(
        p_teacher_id,
        v_local_today,
        v_local_today + 83
    );
end;
$$;

revoke all on function public.generate_teacher_slots(uuid, date, date) from public;
revoke all on function public.save_teacher_weekly_schedule(jsonb, text) from public;
revoke all on function public.refresh_teacher_availability(uuid) from public;

grant execute on function public.save_teacher_weekly_schedule(jsonb, text) to authenticated;
grant execute on function public.refresh_teacher_availability(uuid) to anon, authenticated;

create or replace function public.complete_lesson_purchase(
    p_purchase_id uuid,
    p_checkout_session_id text,
    p_payment_intent_id text,
    p_amount_total integer,
    p_currency text
)
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
    v_purchase public.lesson_purchases%rowtype;
    v_balance integer;
begin
    select *
    into v_purchase
    from public.lesson_purchases
    where id = p_purchase_id
    for update;

    if not found then
        raise exception 'Purchase was not found.';
    end if;

    if v_purchase.stripe_checkout_session_id is not null
       and v_purchase.stripe_checkout_session_id <> p_checkout_session_id then
        raise exception 'Checkout session does not match the purchase.';
    end if;

    if v_purchase.status = 'paid'::public.lesson_purchase_status then
        select paid_lessons
        into v_balance
        from public.student_lesson_balances
        where student_id = v_purchase.student_id;
        return coalesce(v_balance, 0);
    end if;

    if v_purchase.status <> 'pending'::public.lesson_purchase_status then
        raise exception 'This purchase can no longer be completed.';
    end if;

    if v_purchase.amount_minor <> p_amount_total
       or v_purchase.currency <> lower(p_currency) then
        raise exception 'Paid amount or currency does not match the purchase.';
    end if;

    insert into public.student_lesson_balances (student_id)
    values (v_purchase.student_id)
    on conflict (student_id) do nothing;

    update public.student_lesson_balances
    set paid_lessons = paid_lessons + v_purchase.lesson_count
    where student_id = v_purchase.student_id
    returning paid_lessons into v_balance;

    update public.lesson_purchases
    set status = 'paid'::public.lesson_purchase_status,
        stripe_checkout_session_id = p_checkout_session_id,
        stripe_payment_intent_id = p_payment_intent_id,
        paid_at = now()
    where id = v_purchase.id;

    insert into public.lesson_credit_transactions (
        student_id,
        transaction_type,
        lesson_delta,
        balance_after,
        purchase_id,
        note
    )
    values (
        v_purchase.student_id,
        'purchase'::public.lesson_credit_transaction_type,
        v_purchase.lesson_count,
        v_balance,
        v_purchase.id,
        'Stripe lesson package purchase'
    );

    return v_balance;
end;
$$;

revoke all on function public.complete_lesson_purchase(uuid, text, text, integer, text) from public;
revoke all on function public.complete_lesson_purchase(uuid, text, text, integer, text) from anon, authenticated;
grant execute on function public.complete_lesson_purchase(uuid, text, text, integer, text) to service_role;

create or replace function public.book_lesson(p_slot_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
    v_student_id uuid := auth.uid();
    v_role public.user_role;
    v_slot public.teacher_availability%rowtype;
    v_trial_used_at timestamptz;
    v_paid_lessons integer;
    v_balance_after integer;
    v_credit_source public.lesson_credit_source;
    v_booking_id uuid;
begin
    if v_student_id is null then
        raise exception 'Log in as a student to book a lesson.';
    end if;

    select role
    into v_role
    from public.profiles
    where id = v_student_id;

    if v_role is distinct from 'student'::public.user_role then
        raise exception 'Only student accounts can book lessons.';
    end if;

    select *
    into v_slot
    from public.teacher_availability
    where id = p_slot_id
    for update;

    if not found
       or v_slot.status <> 'available'::public.availability_status
       or v_slot.starts_at <= now() then
        raise exception 'This lesson time is no longer available.';
    end if;

    if not public.is_approved_teacher(v_slot.teacher_id) then
        raise exception 'This teacher is not available for booking.';
    end if;

    insert into public.student_lesson_balances (student_id)
    values (v_student_id)
    on conflict (student_id) do nothing;

    select free_trial_used_at, paid_lessons
    into v_trial_used_at, v_paid_lessons
    from public.student_lesson_balances
    where student_id = v_student_id
    for update;

    if v_trial_used_at is null then
        v_credit_source := 'free_trial'::public.lesson_credit_source;
    elsif v_paid_lessons > 0 then
        v_credit_source := 'paid_credit'::public.lesson_credit_source;
    else
        raise exception 'You do not have lessons on your balance. Buy a lesson package first.';
    end if;

    insert into public.lesson_bookings (
        slot_id,
        student_id,
        teacher_id,
        starts_at,
        ends_at,
        credit_source
    )
    values (
        v_slot.id,
        v_student_id,
        v_slot.teacher_id,
        v_slot.starts_at,
        v_slot.ends_at,
        v_credit_source
    )
    returning id into v_booking_id;

    if v_credit_source = 'free_trial'::public.lesson_credit_source then
        update public.student_lesson_balances
        set free_trial_used_at = now()
        where student_id = v_student_id;
    else
        update public.student_lesson_balances
        set paid_lessons = paid_lessons - 1
        where student_id = v_student_id
        returning paid_lessons into v_balance_after;

        insert into public.lesson_credit_transactions (
            student_id,
            transaction_type,
            lesson_delta,
            balance_after,
            booking_id,
            note
        )
        values (
            v_student_id,
            'booking'::public.lesson_credit_transaction_type,
            -1,
            v_balance_after,
            v_booking_id,
            'Lesson booked'
        );
    end if;

    update public.teacher_availability
    set status = 'booked'::public.availability_status
    where id = v_slot.id;

    return v_booking_id;
end;
$$;

revoke all on function public.book_lesson(uuid) from public;
grant execute on function public.book_lesson(uuid) to authenticated;

create or replace function public.create_teacher_availability(p_starts_at timestamptz)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
    v_teacher_id uuid := auth.uid();
    v_duration integer;
    v_approval public.teacher_approval_status;
    v_ends_at timestamptz;
    v_slot_id uuid;
begin
    if v_teacher_id is null then
        raise exception 'Log in before adding availability.';
    end if;

    select lesson_duration_minutes, approval_status
    into v_duration, v_approval
    from public.teacher_profiles
    where user_id = v_teacher_id;

    if not found then
        raise exception 'Only teacher accounts can add availability.';
    end if;

    if v_approval <> 'approved'::public.teacher_approval_status then
        raise exception 'Your teacher profile must be approved first.';
    end if;

    if p_starts_at <= now() + interval '15 minutes' then
        raise exception 'Choose a time at least 15 minutes from now.';
    end if;

    v_ends_at := p_starts_at + make_interval(mins => v_duration);

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_teacher_id::text, 0)
    );

    if exists (
        select 1
        from public.teacher_availability
        where teacher_id = v_teacher_id
          and status <> 'cancelled'::public.availability_status
          and starts_at < v_ends_at
          and ends_at > p_starts_at
    ) then
        raise exception 'This time overlaps another availability slot.';
    end if;

    insert into public.teacher_availability (teacher_id, starts_at, ends_at)
    values (v_teacher_id, p_starts_at, v_ends_at)
    returning id into v_slot_id;

    return v_slot_id;
end;
$$;

create or replace function public.cancel_teacher_availability(p_slot_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
    if auth.uid() is null then
        raise exception 'Log in before changing availability.';
    end if;

    update public.teacher_availability
    set status = 'cancelled'::public.availability_status
    where id = p_slot_id
      and teacher_id = auth.uid()
      and status = 'available'::public.availability_status;

    if not found then
        raise exception 'Only an unbooked availability slot can be cancelled.';
    end if;
end;
$$;

create or replace function public.book_free_trial(p_slot_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
    v_student_id uuid := auth.uid();
    v_role public.user_role;
    v_slot public.teacher_availability%rowtype;
    v_trial_used_at timestamptz;
    v_booking_id uuid;
begin
    if v_student_id is null then
        raise exception 'Log in as a student to book a lesson.';
    end if;

    select role
    into v_role
    from public.profiles
    where id = v_student_id;

    if v_role is distinct from 'student'::public.user_role then
        raise exception 'Only student accounts can book lessons.';
    end if;

    select *
    into v_slot
    from public.teacher_availability
    where id = p_slot_id
    for update;

    if not found
       or v_slot.status <> 'available'::public.availability_status
       or v_slot.starts_at <= now() then
        raise exception 'This lesson time is no longer available.';
    end if;

    if not public.is_approved_teacher(v_slot.teacher_id) then
        raise exception 'This teacher is not available for booking.';
    end if;

    insert into public.student_lesson_balances (student_id)
    values (v_student_id)
    on conflict (student_id) do nothing;

    select free_trial_used_at
    into v_trial_used_at
    from public.student_lesson_balances
    where student_id = v_student_id
    for update;

    if v_trial_used_at is not null then
        raise exception 'Your free trial lesson has already been used.';
    end if;

    update public.student_lesson_balances
    set free_trial_used_at = now()
    where student_id = v_student_id;

    insert into public.lesson_bookings (
        slot_id,
        student_id,
        teacher_id,
        starts_at,
        ends_at,
        credit_source
    )
    values (
        v_slot.id,
        v_student_id,
        v_slot.teacher_id,
        v_slot.starts_at,
        v_slot.ends_at,
        'free_trial'::public.lesson_credit_source
    )
    returning id into v_booking_id;

    update public.teacher_availability
    set status = 'booked'::public.availability_status
    where id = v_slot.id;

    return v_booking_id;
end;
$$;

revoke all on function public.create_teacher_availability(timestamptz) from public;
revoke all on function public.cancel_teacher_availability(uuid) from public;
revoke all on function public.book_free_trial(uuid) from public;

grant execute on function public.create_teacher_availability(timestamptz) to authenticated;
grant execute on function public.cancel_teacher_availability(uuid) to authenticated;
grant execute on function public.book_free_trial(uuid) to authenticated;

-- Public image bucket for teacher avatars. Uploads are limited to the signed-in
-- teacher's own folder and to common image formats up to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'teacher-avatars',
    'teacher-avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Teacher avatars are publicly visible" on storage.objects;
create policy "Teacher avatars are publicly visible"
    on storage.objects
    for select
    to public
    using (bucket_id = 'teacher-avatars');

drop policy if exists "Teachers can upload their own avatar" on storage.objects;
create policy "Teachers can upload their own avatar"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'teacher-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Teachers can update their own avatar" on storage.objects;
create policy "Teachers can update their own avatar"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'teacher-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    )
    with check (
        bucket_id = 'teacher-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

drop policy if exists "Teachers can delete their own avatar" on storage.objects;
create policy "Teachers can delete their own avatar"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'teacher-avatars'
        and (storage.foldername(name))[1] = (select auth.uid())::text
    );

commit;

-- Verification queries (optional):
-- select * from public.profiles;
-- select * from public.teacher_profiles;
