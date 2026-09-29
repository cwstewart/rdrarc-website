# Member login and calendar

## Architecture decision

The existing HTML/CSS/JavaScript site and Cloudflare Pages hosting remain in place. `members.html` adds email/password authentication through Supabase Auth and reads calendar events from Supabase PostgreSQL. No frontend framework, application server, or production build step is required. The owner selected Supabase, administrator approval, and administrator-managed events.

The browser uses the vendored Supabase JavaScript client 2.117.2. Its source and MIT license are in `vendor/`. Credentials are handled by Supabase Auth, never by a custom password table. Sessions use sessionStorage, survive a page refresh, and normally end when the tab is closed. Members should still sign out on shared computers. No service-role key belongs in this repository or browser.

Row-level security (RLS) protects the database, independently of the UI:

| Visitor | Own membership | Other memberships | Calendar | Change events | Approve members |
| --- | --- | --- | --- | --- | --- |
| Signed out | No | No | No | No | No |
| Pending/revoked member | Read | No | No | No | No |
| Approved member | Read | No | Read | No | No |
| Approved administrator | Read | Read | Read | Create/edit/delete | Yes |

Users cannot set their own approval or role, including through signup metadata. The UI can only update the `approved` column for ordinary members. Administrator assignment and removal are owner-controlled database operations. Permission helpers read current database membership, so revocation blocks subsequent API reads even with an existing login token. Previously viewed/downloaded information cannot be recalled; the UI clears data on refresh, signout, and auth refresh.

Events store UTC timestamps and display in each visitor's browser time zone, named above the calendar. Administrators enter local times. Events spanning days/months appear on each overlapping date; an event ending at midnight does not also appear on the following day. Recurring events and all-day semantics are not included: enter separate timed events. The calendar also has a readable event list with location/frequency and details.

## One-time Supabase setup

The branch intentionally ships **unconfigured** at the owner's request. No real members, credentials, or club events have been created.

1. Create a dedicated Supabase project for this website, preferably a separate development project first. Keep the database password in your password manager.
2. In its SQL Editor, run `supabase/migrations/202609290001_member_calendar.sql` once. It creates the tables, permissions, signup/email-sync triggers, and pending membership records for any existing accounts. Apply to a fresh project; if tables with these names already exist, review them before running. The migration is transactional and intentionally does not drop existing tables.
3. In Authentication, enable email/password signup and **Confirm email**. Set minimum password length to at least 12. Disable anonymous sign-ins. Configure your own SMTP sender so confirmation and recovery messages can reach club members; the built-in mail service is not suitable for general club email delivery. Verify sender/domain settings with your mail provider.
4. Set the Auth Site URL to your approved site origin, for example `https://rdrarc.org`. Add exact Redirect URLs for `https://rdrarc.org/members.html` and the trusted development preview's `/members.html`. For local testing add `http://127.0.0.1:4173/members.html`. Avoid broad production redirect wildcards; remove unused preview URLs.
5. Copy the project URL and **publishable key** into `js/config.js`. These are public connection settings, intended to ship to browsers; RLS is what protects the data. Do not use the database password, secret key, or service-role key. This plain static site does not substitute Cloudflare environment variables into JavaScript automatically.
6. Deploy the development branch as a Cloudflare Pages preview and use **Request membership** to create your first administrator's account. Confirm its email. In Supabase Authentication → Users, verify the account and copy its UUID.
7. As the project owner in the SQL Editor, replace the example UUID below with that verified account UUID, then run:

   ```sql
   update public.members
   set role = 'admin', approved = true
   where user_id = 'REPLACE-WITH-VERIFIED-USER-UUID'::uuid;
   ```

8. Sign in or refresh the member page. The administrator controls should appear. Add a real event and verify access with a separate approved member and pending account.

To add another administrator, repeat the owner-only UUID update after verifying their identity. To remove an administrator, use the SQL Editor to set `role = 'member', approved = false` for their UUID. Keep at least one trusted administrator. Delete accounts through Supabase Auth when appropriate; membership rows are deleted automatically. Event records remain.

An account request does not automatically mean someone is a club member. Administrators must verify requests before approving them. Approval does not currently send an email notification; tell the member to sign in and refresh. Pending requests appear in the administrator member list. Editing/deleting events is immediate in Supabase and does not require a website redeploy.

## Deployment

- Keep Cloudflare Pages framework preset **None**, build command empty, and output directory the repository root. The root `package.json` and lockfile provide development tests only; the website does not require an install/build to serve. If automatic dependency installation is enabled by Cloudflare, set `SKIP_DEPENDENCY_INSTALL=true` for this static project.
- Configure branch previews for `development/member-calendar`. Keep `main` as the production branch. This change does not merge or deploy production.
- Configure Supabase before inviting members, and test the exact preview redirect URL. An unconfigured page displays a preparation message and never shows a pretend login or sample private events.
- Production requires the reviewed code/configuration merged to the production branch plus Supabase database/auth/SMTP setup. Confirm the Pages deployment actually succeeded; a Git push alone is not proof.
- If development and production use separate Supabase projects, apply the migration and administrator bootstrap separately. Commit only the intended production public configuration for the production deployment. Do not mix real membership data into test fixtures.
- To roll back the website, redeploy the prior Pages version. This does not delete Supabase users or events. Do not remove database tables to roll back the UI.

## Verification

Install Node.js 22+ and pnpm 11.19.0, then:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm preview
```

Open `http://127.0.0.1:4173` for the public site or `/members.html` for the member area. Opening the HTML using `file://` does not support the JavaScript modules. If using an installed Microsoft Edge for browser checks, set `BROWSER_CHANNEL=msedge` in your shell. Screenshots are written to ignored `test-results/`.

Automated checks include:

- Calendar layout, leap years, month/year boundaries, multi-day overlap, midnight boundaries, and daylight-saving input validation.
- Real PostgreSQL execution of the migration/RLS using PGlite with a minimal Supabase Auth schema: signed-out denial, pending/revoked denial, approved reads, administrator writes/approvals, forbidden role escalation, forged signup metadata, and email synchronization.
- Browser checks with the **actual vendored SDK** and mocked Supabase HTTP responses: unconfigured state, signup, login, pending approval, recovery, session reload, month navigation, empty/error states, administrator event changes, approval, signout, safe text rendering, desktop/mobile layout, and public navigation.

The tests do **not** prove hosted Supabase configuration, email delivery, real token validation/refresh, or Cloudflare integration. Before production, use separate real accounts to verify confirmation and password reset emails, approved and pending access, event changes, revoked access using an existing session, and direct API denial for unauthorized reads/writes. Run Supabase's security advisor and verify the public key cannot bypass RLS. Test recovery links in the browsers members actually use.

Official references: [password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
