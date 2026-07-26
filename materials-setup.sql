-- POLYGLOT: private learning materials and homework
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

begin;

create table if not exists public.learning_materials (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null
        references public.teacher_profiles(user_id)
        on delete cascade,
    audience_student_id uuid
        references public.profiles(id)
        on delete cascade,
    title text not null
        check (char_length(trim(title)) between 2 and 140),
    description text not null default ''
        check (char_length(description) <= 3000),
    material_type text not null
        check (material_type in ('file', 'link')),
    file_path text,
    file_name text,
    external_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (
            material_type = 'file'
            and file_path is not null
            and file_name is not null
            and external_url is null
        )
        or
        (
            material_type = 'link'
            and external_url is not null
            and file_path is null
            and file_name is null
        )
    )
);

create table if not exists public.homework_assignments (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null
        references public.teacher_profiles(user_id)
        on delete cascade,
    student_id uuid not null
        references public.profiles(id)
        on delete cascade,
    title text not null
        check (char_length(trim(title)) between 2 and 140),
    instructions text not null
        check (char_length(trim(instructions)) between 2 and 5000),
    due_at timestamptz,
    attachment_path text,
    attachment_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (
        (attachment_path is null and attachment_name is null)
        or
        (attachment_path is not null and attachment_name is not null)
    )
);

create table if not exists public.homework_submissions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null
        references public.homework_assignments(id)
        on delete cascade,
    student_id uuid not null
        references public.profiles(id)
        on delete cascade,
    response_text text
        check (
            response_text is null
            or char_length(response_text) <= 5000
        ),
    file_path text,
    file_name text,
    status text not null default 'submitted'
        check (
            status in (
                'submitted',
                'reviewed',
                'changes_requested'
            )
        ),
    teacher_feedback text
        check (
            teacher_feedback is null
            or char_length(teacher_feedback) <= 5000
        ),
    submitted_at timestamptz not null default now(),
    reviewed_at timestamptz,
    updated_at timestamptz not null default now(),
    unique (assignment_id, student_id),
    check (
        (file_path is null and file_name is null)
        or
        (file_path is not null and file_name is not null)
    ),
    check (
        response_text is not null
        or file_path is not null
    )
);

create index if not exists
    learning_materials_teacher_created_idx
    on public.learning_materials(teacher_id, created_at desc);

create index if not exists
    learning_materials_student_created_idx
    on public.learning_materials(audience_student_id, created_at desc);

create index if not exists
    homework_assignments_teacher_created_idx
    on public.homework_assignments(teacher_id, created_at desc);

create index if not exists
    homework_assignments_student_due_idx
    on public.homework_assignments(student_id, due_at);

create index if not exists
    homework_submissions_assignment_idx
    on public.homework_submissions(assignment_id);

create or replace function public.set_materials_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists
    learning_materials_set_updated_at
    on public.learning_materials;

create trigger learning_materials_set_updated_at
before update on public.learning_materials
for each row execute function public.set_materials_updated_at();

drop trigger if exists
    homework_assignments_set_updated_at
    on public.homework_assignments;

create trigger homework_assignments_set_updated_at
before update on public.homework_assignments
for each row execute function public.set_materials_updated_at();

drop trigger if exists
    homework_submissions_set_updated_at
    on public.homework_submissions;

create trigger homework_submissions_set_updated_at
before update on public.homework_submissions
for each row execute function public.set_materials_updated_at();

alter table public.learning_materials enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.homework_submissions enable row level security;

drop policy if exists
    "Teachers can view their learning materials"
    on public.learning_materials;

create policy
    "Teachers can view their learning materials"
    on public.learning_materials
    for select
    to authenticated
    using (teacher_id = (select auth.uid()));

drop policy if exists
    "Students can view shared learning materials"
    on public.learning_materials;

create policy
    "Students can view shared learning materials"
    on public.learning_materials
    for select
    to authenticated
    using (
        audience_student_id = (select auth.uid())
        or (
            audience_student_id is null
            and exists (
                select 1
                from public.lesson_bookings as booking
                where booking.teacher_id =
                    learning_materials.teacher_id
                  and booking.student_id =
                    (select auth.uid())
            )
        )
    );

drop policy if exists
    "Teachers can create learning materials"
    on public.learning_materials;

create policy
    "Teachers can create learning materials"
    on public.learning_materials
    for insert
    to authenticated
    with check (
        teacher_id = (select auth.uid())
        and (
            audience_student_id is null
            or exists (
                select 1
                from public.lesson_bookings as booking
                where booking.teacher_id =
                    (select auth.uid())
                  and booking.student_id =
                    learning_materials.audience_student_id
            )
        )
    );

drop policy if exists
    "Teachers can update learning materials"
    on public.learning_materials;

create policy
    "Teachers can update learning materials"
    on public.learning_materials
    for update
    to authenticated
    using (teacher_id = (select auth.uid()))
    with check (
        teacher_id = (select auth.uid())
        and (
            audience_student_id is null
            or exists (
                select 1
                from public.lesson_bookings as booking
                where booking.teacher_id =
                    (select auth.uid())
                  and booking.student_id =
                    learning_materials.audience_student_id
            )
        )
    );

drop policy if exists
    "Teachers can delete learning materials"
    on public.learning_materials;

create policy
    "Teachers can delete learning materials"
    on public.learning_materials
    for delete
    to authenticated
    using (teacher_id = (select auth.uid()));

drop policy if exists
    "Homework participants can view assignments"
    on public.homework_assignments;

create policy
    "Homework participants can view assignments"
    on public.homework_assignments
    for select
    to authenticated
    using (
        teacher_id = (select auth.uid())
        or student_id = (select auth.uid())
    );

drop policy if exists
    "Teachers can create homework"
    on public.homework_assignments;

create policy
    "Teachers can create homework"
    on public.homework_assignments
    for insert
    to authenticated
    with check (
        teacher_id = (select auth.uid())
        and exists (
            select 1
            from public.lesson_bookings as booking
            where booking.teacher_id =
                (select auth.uid())
              and booking.student_id =
                homework_assignments.student_id
        )
    );

drop policy if exists
    "Teachers can update homework"
    on public.homework_assignments;

create policy
    "Teachers can update homework"
    on public.homework_assignments
    for update
    to authenticated
    using (teacher_id = (select auth.uid()))
    with check (
        teacher_id = (select auth.uid())
        and exists (
            select 1
            from public.lesson_bookings as booking
            where booking.teacher_id =
                (select auth.uid())
              and booking.student_id =
                homework_assignments.student_id
        )
    );

drop policy if exists
    "Teachers can delete homework"
    on public.homework_assignments;

create policy
    "Teachers can delete homework"
    on public.homework_assignments
    for delete
    to authenticated
    using (teacher_id = (select auth.uid()));

drop policy if exists
    "Homework participants can view submissions"
    on public.homework_submissions;

create policy
    "Homework participants can view submissions"
    on public.homework_submissions
    for select
    to authenticated
    using (
        student_id = (select auth.uid())
        or exists (
            select 1
            from public.homework_assignments as assignment
            where assignment.id =
                homework_submissions.assignment_id
              and assignment.teacher_id =
                (select auth.uid())
        )
    );

revoke all on table public.learning_materials from anon;
revoke all on table public.homework_assignments from anon;
revoke all on table public.homework_submissions from anon;

grant select, insert, update, delete
    on table public.learning_materials
    to authenticated;

grant select, insert, update, delete
    on table public.homework_assignments
    to authenticated;

grant select
    on table public.homework_submissions
    to authenticated;

create or replace function public.get_my_material_students()
returns table (
    student_id uuid,
    student_name text
)
language sql
stable
security definer
set search_path = ''
as $$
    select
        profile.id as student_id,
        profile.full_name as student_name
    from public.profiles as profile
    where auth.uid() is not null
      and exists (
          select 1
          from public.teacher_profiles as teacher
          where teacher.user_id = auth.uid()
      )
      and exists (
          select 1
          from public.lesson_bookings as booking
          where booking.teacher_id = auth.uid()
            and booking.student_id = profile.id
      )
    order by profile.full_name;
$$;

create or replace function public.submit_homework(
    p_assignment_id uuid,
    p_response_text text default null,
    p_file_path text default null,
    p_file_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_student_id uuid;
    v_submission_id uuid;
    v_response_text text;
begin
    if auth.uid() is null then
        raise exception 'You must be signed in.';
    end if;

    select assignment.student_id
      into v_student_id
    from public.homework_assignments as assignment
    where assignment.id = p_assignment_id;

    if v_student_id is null or v_student_id <> auth.uid() then
        raise exception 'Homework assignment not found.';
    end if;

    v_response_text := nullif(trim(coalesce(p_response_text, '')), '');

    if v_response_text is null and p_file_path is null then
        raise exception 'Write an answer or attach a file.';
    end if;

    if char_length(coalesce(v_response_text, '')) > 5000 then
        raise exception 'The answer is too long.';
    end if;

    if (p_file_path is null) <> (p_file_name is null) then
        raise exception 'The attachment information is incomplete.';
    end if;

    if p_file_path is not null and
       p_file_path not like
           ('submissions/' || auth.uid()::text || '/%') then
        raise exception 'Invalid attachment path.';
    end if;

    insert into public.homework_submissions (
        assignment_id,
        student_id,
        response_text,
        file_path,
        file_name,
        status,
        teacher_feedback,
        submitted_at,
        reviewed_at
    )
    values (
        p_assignment_id,
        auth.uid(),
        v_response_text,
        p_file_path,
        p_file_name,
        'submitted',
        null,
        now(),
        null
    )
    on conflict (assignment_id, student_id)
    do update set
        response_text = excluded.response_text,
        file_path = excluded.file_path,
        file_name = excluded.file_name,
        status = 'submitted',
        teacher_feedback = null,
        submitted_at = now(),
        reviewed_at = null
    returning id into v_submission_id;

    return v_submission_id;
end;
$$;

create or replace function public.review_homework(
    p_assignment_id uuid,
    p_status text,
    p_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_feedback text;
begin
    if auth.uid() is null then
        raise exception 'You must be signed in.';
    end if;

    if p_status not in ('reviewed', 'changes_requested') then
        raise exception 'Invalid homework status.';
    end if;

    if not exists (
        select 1
        from public.homework_assignments as assignment
        where assignment.id = p_assignment_id
          and assignment.teacher_id = auth.uid()
    ) then
        raise exception 'Homework assignment not found.';
    end if;

    v_feedback := nullif(trim(coalesce(p_feedback, '')), '');

    if char_length(coalesce(v_feedback, '')) > 5000 then
        raise exception 'The feedback is too long.';
    end if;

    update public.homework_submissions
       set status = p_status,
           teacher_feedback = v_feedback,
           reviewed_at = now()
     where assignment_id = p_assignment_id;

    if not found then
        raise exception 'The student has not submitted this homework yet.';
    end if;
end;
$$;

revoke all on function
    public.get_my_material_students()
    from public;

revoke all on function
    public.submit_homework(uuid, text, text, text)
    from public;

revoke all on function
    public.review_homework(uuid, text, text)
    from public;

grant execute on function
    public.get_my_material_students()
    to authenticated;

grant execute on function
    public.submit_homework(uuid, text, text, text)
    to authenticated;

grant execute on function
    public.review_homework(uuid, text, text)
    to authenticated;

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'course-files',
    'course-files',
    false,
    26214400,
    array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'audio/mpeg',
        'audio/wav',
        'audio/ogg'
    ]
)
on conflict (id)
do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists
    "Teachers can upload course files"
    on storage.objects;

create policy
    "Teachers can upload course files"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'course-files'
        and (storage.foldername(name))[1]
            in ('materials', 'homework')
        and (storage.foldername(name))[2] =
            (select auth.uid())::text
        and exists (
            select 1
            from public.teacher_profiles as teacher
            where teacher.user_id = (select auth.uid())
        )
    );

drop policy if exists
    "Students can upload homework submissions"
    on storage.objects;

create policy
    "Students can upload homework submissions"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'course-files'
        and (storage.foldername(name))[1] = 'submissions'
        and (storage.foldername(name))[2] =
            (select auth.uid())::text
        and exists (
            select 1
            from public.profiles as profile
            where profile.id = (select auth.uid())
              and profile.role =
                  'student'::public.user_role
        )
    );

drop policy if exists
    "Participants can download course files"
    on storage.objects;

create policy
    "Participants can download course files"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'course-files'
        and (
            exists (
                select 1
                from public.learning_materials as material
                where material.file_path = name
                  and (
                      material.teacher_id =
                          (select auth.uid())
                      or material.audience_student_id =
                          (select auth.uid())
                      or (
                          material.audience_student_id is null
                          and exists (
                              select 1
                              from public.lesson_bookings as booking
                              where booking.teacher_id =
                                  material.teacher_id
                                and booking.student_id =
                                  (select auth.uid())
                          )
                      )
                  )
            )
            or exists (
                select 1
                from public.homework_assignments as assignment
                where assignment.attachment_path = name
                  and (
                      assignment.teacher_id =
                          (select auth.uid())
                      or assignment.student_id =
                          (select auth.uid())
                  )
            )
            or exists (
                select 1
                from public.homework_submissions as submission
                join public.homework_assignments as assignment
                  on assignment.id =
                      submission.assignment_id
                where submission.file_path = name
                  and (
                      submission.student_id =
                          (select auth.uid())
                      or assignment.teacher_id =
                          (select auth.uid())
                  )
            )
        )
    );

drop policy if exists
    "Owners can delete course files"
    on storage.objects;

create policy
    "Owners can delete course files"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'course-files'
        and (storage.foldername(name))[2] =
            (select auth.uid())::text
        and (storage.foldername(name))[1]
            in ('materials', 'homework', 'submissions')
    );

commit;
