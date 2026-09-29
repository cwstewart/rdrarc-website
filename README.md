# Red Dirt Road Rangers Amateur Radio Club Website

Static website for **rdrarc.org**.

## Deploy to Cloudflare Pages

1. Upload this repository to GitHub.
2. In Cloudflare, open **Workers & Pages** and create a Pages project.
3. Connect the GitHub repository.
4. Use **None** as the framework preset. No build command is required.
5. Deploy the repository root.
6. Add `rdrarc.org` as a custom domain.

## Editing

- Main page: `index.html`
- Styling: `css/site.css`
- JavaScript: `js/site.js`
- Put club images/logos in `images/`
- Member login and calendar: `members.html`, `css/members.css`, `js/members.js`, `js/calendar.js`
- Public Supabase connection settings: `js/config.js` (intentionally blank until setup)

## Member calendar

Members can request an email/password account, confirm their email, and sign in.
An administrator must approve membership before the calendar is accessible.
Approved administrators can approve/revoke ordinary members and add, edit, or delete events.
Supabase Auth and database row-level security enforce access permissions.

See [member calendar setup and operations](docs/member-calendar.md) for the database migration,
email configuration, first administrator setup, development preview, and production checklist.
Never put secret/service-role keys or passwords in browser configuration.

## Development checks

The production site remains static with no build command. Node.js 22+ and pnpm are used only for tests and local preview:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm preview
```

The browser tests use simulated Supabase responses. Real email and hosted authentication require the setup and live checks documented above.

The first version intentionally uses placeholders for net schedules, frequencies, membership contacts, and events rather than publishing unconfirmed club information.
