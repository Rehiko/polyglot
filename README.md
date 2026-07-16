# Polyglot authentication starter

This folder adds a working email/password authentication flow to the existing Polyglot website.

## Included

- Login and registration tabs
- Student or teacher role selection
- Email confirmation handling
- Forgot-password request
- New-password page
- Protected starter dashboard
- Logout
- Responsive Polyglot styling

## 1. Copy the files

Place all files from this folder next to your existing `index.html`, `layout.css`, and `script.js` files.

## 2. Change the Login link in index.html

Replace:

```html
<a href="#" data-i18n="login">Login</a>
```

with:

```html
<a href="login.html#login" data-i18n="login">Login</a>
```

## 3. Create and connect Supabase

1. Create a Supabase project.
2. Open Project Settings -> API.
3. Copy the Project URL.
4. Copy the publishable key (older projects can show it as the `anon` key).
5. Open `supabase-config.js` and replace both placeholder values.

```js
window.POLYGLOT_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.POLYGLOT_SUPABASE_KEY = "YOUR-PUBLISHABLE-KEY";  bb5GYMSybb5GYMSy_123        School Language Polyglot    sb_publishable_QxvRMYPd2qs0xx2-F7OIIg_ZRnauqfW
``` 

The publishable/anon key is intended for browser use when Row Level Security is configured. Never use a `service_role` key here.

## 4. Configure URLs in Supabase

Open Authentication -> URL Configuration.

For local development with VS Code Live Server, use a Site URL similar to:

```text
http://127.0.0.1:5500/
```

Add a redirect URL for the reset page:

```text
http://127.0.0.1:5500/reset-password.html
```

If your project is inside a subfolder, include that subfolder in both URLs. Add your real domain when the website is deployed.

## 5. Run the site

Use VS Code Live Server or another local web server. Do not test authentication by opening `login.html` directly as a `file://` address.

Test this order:

1. Open `login.html#register`.
2. Create a test student account.
3. Confirm the email if email confirmation is enabled.
4. Log in.
5. Confirm that `dashboard.html` opens.
6. Log out.
7. Test the Forgot password link.

## Security note

The selected role is currently saved in authentication metadata so the first version can work without database tables. Before building teacher approval, payments, or administrator access, roles must be moved to a protected `profiles` table with Row Level Security. Never create an `admin` role from a public registration form.
