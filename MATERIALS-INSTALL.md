# Polyglot Materials + Homework

## 1. Create the database

Open Supabase Dashboard → SQL Editor → New query.

Copy the complete contents of `materials-setup.sql`, run it once, and wait for:

`Success. No rows returned`

The script creates:

- private learning materials;
- homework assignments and submissions;
- teacher review statuses and feedback;
- a private `course-files` Storage bucket;
- Row Level Security policies for teachers and students.

## 2. Add the website files

Place these new files in the main website folder:

- `materials.html`
- `materials.css`
- `materials.js`
- `materials-setup.sql`

Replace these existing files with the versions from this package:

- `student-dashboard.html`
- `teacher-dashboard.html`
- `messages.html`

Keep the existing `unread-navigation.js` file in the same folder.

## 3. Commit and deploy

Run in the project terminal:

```powershell
git add materials.html materials.css materials.js materials-setup.sql student-dashboard.html teacher-dashboard.html messages.html
git commit -m "Add materials and homework"
git push origin main
```

Wait one or two minutes for GitHub Pages.

## 4. Test

1. Sign in as a teacher.
2. Open **Materials**.
3. Upload a textbook or share a link with one student or all students.
4. Create homework for a student.
5. Sign in as that student and open **Materials**.
6. Download the material and submit homework.
7. Return as the teacher and mark it **Reviewed** or **Changes requested**.

Files are private and limited to 25 MB. Allowed formats include images, PDF,
Word, PowerPoint, text, MP3, WAV, and OGG.
