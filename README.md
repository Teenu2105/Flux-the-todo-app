# Flux — Smart To-Do & Productivity App

A premium, glassmorphism-styled task manager with a real PostgreSQL database (via Supabase), built with vanilla HTML/CSS/JS. No build step, no framework — just open `index.html` (served, not double-clicked — see setup guide) and go.

## Features

- Full task CRUD: create, edit, delete, complete/uncomplete, duplicate, pin, mark important
- Subtasks with per-subtask completion and a progress bar
- Priorities (Low/Medium/High/Urgent), categories, and free-form tags
- Views: All, Today, Upcoming, Pending, Completed, Overdue, Important, Pinned
- Instant search across title, description, category, and tags
- Combinable filters (priority + category) and sorting (newest, oldest, due date, priority, A–Z, recently updated)
- Live dashboard: total, completed, pending, due today, overdue, high-priority counts + overall completion %
- Dark / light theme, saved across visits
- Mobile-first responsive layout with a floating "Add Task" button
- Toasts, skeleton loading states, empty states, and a delete-confirmation modal — no browser `alert()`
- Data persists in a real Postgres database, protected by Row Level Security

## Tech Stack

- HTML5 + Tailwind CSS (CDN) + custom CSS for the glass effects
- Vanilla JavaScript (ES6+, no bundler)
- Supabase (PostgreSQL + REST API + Auth-ready)
- Lucide icons, Google Fonts (Sora + Inter)

## Folder Structure

```
todo-productivity-app/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js      ← paste your Supabase URL + anon key here
│   ├── database.js    ← all Supabase queries (service layer)
│   └── app.js          ← UI logic, rendering, event handling
├── database/
│   └── schema.sql      ← run this in Supabase's SQL editor
└── README.md
```

## Database Architecture

Two tables:

- **`tasks`** — one row per task. Holds title, description, category, priority, due_date/due_time, completed/important/pinned flags, tags (text array), and timestamps. `updated_at` is auto-maintained by a trigger.
- **`subtasks`** — one row per subtask, linked via `task_id` with `ON DELETE CASCADE` (deleting a task deletes its subtasks automatically).

Indexes are added on the columns used for filtering (user_id, completed, due_date, priority, pinned, task_id).

See `database/schema.sql` for the full, ready-to-run SQL.

### Row Level Security

RLS is **enabled** on both tables. Phase 1 (no login) policies restrict all operations to rows where `user_id is null` — meaning the app works immediately with just the public anon key, as a single-user personal tool. Commented-out Phase 2 policies in the same file show exactly how to switch to per-user access once you add Supabase Auth (see the schema file for details).

## Configuring Supabase

1. Create a Supabase project.
2. Run `database/schema.sql` in the SQL editor.
3. Copy your **Project URL** and **anon public key** from Project Settings → API.
4. Paste both into `js/config.js`.

**Never** put your Supabase **service_role** key anywhere in this frontend code — it bypasses RLS entirely and must stay server-side only. This app never needs it.

## Running the Project

This app makes real network requests (to Supabase and CDNs), so it must be **served** over HTTP — opening `index.html` directly via `file://` will not work reliably. Use any static file server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then visit the printed local URL. (Full phone-only instructions are in the setup tutorial below.)

## Deployment

Any static host works: Netlify, Vercel, GitHub Pages, Cloudflare Pages. Just upload/connect the whole `todo-productivity-app` folder — there's no build step.

## Security Considerations

- Only the **anon/public** key ever goes in frontend code — by design it can only do what your RLS policies allow.
- Phase 1 policies mean anyone who obtains your anon key + URL can read/write your tasks. That's fine for a personal single-user tool as long as you don't publish those values elsewhere (they will however be visible in your deployed site's source, which is normal for anon keys — RLS is what actually protects the data). If you want stronger isolation, move to the Phase 2 (Supabase Auth) policies included, commented, in `schema.sql`.
- The `service_role` key must never be added to this project.

## Customizing

- **Colors/theme**: edit the CSS custom properties at the top of `css/style.css` (`:root` for dark, `[data-theme="light"]` for light).
- **Categories**: edit the `<option>` list in the Add Task modal in `index.html` and the dashboard will pick up new categories automatically once used.
- **Priorities**: intentionally fixed to Low/Medium/High/Urgent to match the database `check` constraint; change both the constraint in `schema.sql` and the `<select>` in `index.html` together if you modify these.
