# Green Zone

Campus repair reporting for three-student teams. A student photographs a broken fixture, files a ticket, and the team earns points when an admin verifies it. If that place already has an open ticket, the student confirms it for 5 points instead of opening a duplicate.

## Stack

Next.js App Router, Tailwind CSS, and Supabase (Postgres + Storage). The browser never holds the service role key. Server actions read and write the database.

## Setup

1. Create a Supabase project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql). That creates `teams`, `students`, `issue_reports`, confirmation tracking, point functions, a public `report-images` bucket, and four sample teams.
3. Copy `.env.example` to `.env.local` and fill in:

   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → service_role)
   - `ADMIN_PASSWORD`

4. Install and start:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sample student codes from the seed are `NQ-01`, `LN-01`, `EH-01`, and `SW-01`. Each team has three students (`-01`, `-02`, `-03`).

Room links prefill the report form: [http://localhost:3000/report?location=Room302](http://localhost:3000/report?location=Room302).

## Points

| Action | Points | When they count |
| --- | --- | --- |
| Low severity report | 10 | Admin verifies the ticket |
| Medium severity report | 25 | Admin verifies the ticket |
| High severity report | 50 | Admin verifies the ticket |
| Confirm an open ticket | 5 | Immediately, once per student |

Pending and verified reports count as open. A second ticket cannot be filed for the same place while one is open (`Room 302` and `room302` match). Rejecting a pending report awards nothing and removes confirmation points already given. Marking a verified report fixed keeps the points.

Admin review is at `/admin`.
