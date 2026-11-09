-- POLYGLOT: allow several files inside one learning material
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.

begin;

create table if not exists public.learning_material_files (
    id uuid primary key default gen_random_uuid(),
    material_id uuid not null
        references public.learning_materials(id)
        on delete cascade,
    file_path text not null unique,
    file_name text not null,
    created_at timestamptz not null default now()
);

create index if not exists
    learning_material_files_material_idx
    on public.learning_material_files(material_id, created_at);

-- Keep every file uploaded before this update.
insert into public.learning_material_files (
    material_id,
    file_path,
    file_name,
    created_at
)
select
    material.id,
    material.file_path,
    material.file_name,
    material.created_at
from public.learning_materials as material
where material.material_type = 'file'
  and material.file_path is not null
  and material.file_name is not null
on conflict (file_path) do nothing;

alter table public.learning_material_files
    enable row level security;

drop policy if exists
    "Participants can view learning material files"
    on public.learning_material_files;

create policy
    "Participants can view learning material files"
    on public.learning_material_files
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.learning_materials as material
            where material.id =
                learning_material_files.material_id
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
    );

drop policy if exists
    "Teachers can add learning material files"
    on public.learning_material_files;

create policy
    "Teachers can add learning material files"
    on public.learning_material_files
    for insert
    to authenticated
    with check (
        file_path like (
            'materials/' ||
            (select auth.uid())::text ||
            '/%'
        )
        and exists (
            select 1
            from public.learning_materials as material
            where material.id =
                learning_material_files.material_id
              and material.teacher_id =
                  (select auth.uid())
        )
    );

drop policy if exists
    "Teachers can delete learning material files"
    on public.learning_material_files;

create policy
    "Teachers can delete learning material files"
    on public.learning_material_files
    for delete
    to authenticated
    using (
        exists (
            select 1
            from public.learning_materials as material
            where material.id =
                learning_material_files.material_id
              and material.teacher_id =
                  (select auth.uid())
        )
    );

revoke all
    on table public.learning_material_files
    from anon;

grant select, insert, delete
    on table public.learning_material_files
    to authenticated;

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
                from public.learning_material_files as material_file
                where material_file.file_path = name
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

commit;
