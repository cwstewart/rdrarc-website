import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("PostgreSQL migration enforces member and administrator permissions", async () => {
  const db = new PGlite();
  const admin = "00000000-0000-4000-8000-000000000001";
  const approved = "00000000-0000-4000-8000-000000000002";
  const pending = "00000000-0000-4000-8000-000000000003";
  try {
    // Minimal Supabase auth contract; the real migration and RLS run inside PostgreSQL.
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202609290001_member_calendar.sql", import.meta.url), "utf8"));
    await db.exec(`insert into auth.users values
      ('${admin}', 'admin@example.test', '{}'),
      ('${approved}', 'member@example.test', '{}'),
      ('${pending}', 'pending@example.test', '{"role":"admin","approved":true}');
      update public.members set approved = true where user_id in ('${admin}', '${approved}');
      update public.members set role = 'admin' where user_id = '${admin}';
      insert into public.events (title, starts_at, ends_at) values ('Club net', '2026-10-01T19:00Z', '2026-10-01T20:00Z');`);
    async function as(role, id, action) {
      await db.exec(`set role ${role}; set request.jwt.claim.sub = '${id}';`);
      try { return await action(); } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
    }
    await as("anon", "", async () => {
      await assert.rejects(db.query("select * from public.events"), /permission denied/);
      await assert.rejects(db.query("select * from public.members"), /permission denied/);
      await assert.rejects(db.query("insert into public.events(title,starts_at,ends_at) values('Unauthorized',now(),now()+interval '1 hour')"), /permission denied/);
      await assert.rejects(db.query("update public.events set title='Changed'"), /permission denied/);
      await assert.rejects(db.query("delete from public.events"), /permission denied/);
    });
    await as("authenticated", pending, async () => {
      assert.equal((await db.query("select * from public.events")).rows.length, 0);
      const members = (await db.query("select * from public.members")).rows;
      assert.equal(members.length, 1);
      assert.equal(members[0].approved, false);
      assert.equal(members[0].role, "member");
      assert.equal((await db.query("update public.members set approved=true returning user_id")).rows.length, 0);
      await assert.rejects(db.query("update public.members set role='admin'"), /permission denied/);
    });
    for (const id of [pending, approved]) await as("authenticated", id, async () => {
      await assert.rejects(db.query("insert into public.events(title,starts_at,ends_at) values('Unauthorized',now(),now()+interval '1 hour')"), /row-level security/);
      assert.equal((await db.query("update public.events set title='Changed' returning id")).rows.length, 0);
      assert.equal((await db.query("delete from public.events returning id")).rows.length, 0);
      await assert.rejects(db.query(`insert into public.members(user_id,email,approved) values('${id}','fake',true)`), /permission denied/);
      await assert.rejects(db.query("delete from public.members"), /permission denied/);
      assert.equal((await db.query("update public.members set approved=true returning user_id")).rows.length, 0);
      await assert.rejects(db.query("update public.members set email='forged@example.test'"), /permission denied/);
    });
    await as("authenticated", approved, async () => {
      assert.equal((await db.query("select * from public.events")).rows.length, 1);
      assert.equal((await db.query("select * from public.members")).rows.length, 1);
    });
    await as("authenticated", admin, async () => {
      assert.equal((await db.query("select * from public.members")).rows.length, 3);
      assert.equal((await db.query(`update public.members set approved=true where user_id='${pending}' returning user_id`)).rows.length, 1);
      assert.equal((await db.query(`update public.members set approved=false where user_id='${admin}' returning user_id`)).rows.length, 0);
      await assert.rejects(db.query("update public.members set role='admin'"), /permission denied/);
      const inserted = await db.query("insert into public.events(title,starts_at,ends_at) values('New event',now(),now()+interval '1 hour') returning id");
      const id = inserted.rows[0].id;
      assert.equal((await db.query("update public.events set title='Edited' where id=$1 returning id", [id])).rows.length, 1);
      assert.equal((await db.query("delete from public.events where id=$1 returning id", [id])).rows.length, 1);
      await assert.rejects(db.query("insert into public.events(title,starts_at,ends_at) values('Invalid',now(),now())"), /check constraint/);
      await db.query(`update public.members set approved=false where user_id='${approved}'`);
    });
    await as("authenticated", pending, async () => assert.equal((await db.query("select * from public.events")).rows.length, 1));
    await as("authenticated", approved, async () => assert.equal((await db.query("select * from public.events")).rows.length, 0));
    await db.exec(`update auth.users set email='new@example.test' where id='${pending}';`);
    assert.equal((await db.query("select email from public.members where user_id=$1", [pending])).rows[0].email, "new@example.test");
  } finally { await db.close(); }
});
