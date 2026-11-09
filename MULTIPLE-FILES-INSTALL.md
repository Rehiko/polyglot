# Polyglot multiple material files update

## 1. Update Supabase

Open Supabase Dashboard → SQL Editor → New query.

Run the complete `materials-multiple-files.sql` file once.

Expected result:

`Success. No rows returned`

Existing materials and files are preserved.

## 2. Replace website files

Replace these files in the main website folder:

- `materials.html`
- `materials.css`
- `materials.js`
- `materials-setup.sql`

Keep `materials-multiple-files.sql` in the repository as the update history.

## 3. Commit

```powershell
git add materials.html materials.css materials.js materials-setup.sql materials-multiple-files.sql
git commit -m "Allow multiple material files"
git push origin main
```

Teachers can now select up to 10 files for one learning material. Each file can
be up to 25 MB. Students see all files inside one material card.
