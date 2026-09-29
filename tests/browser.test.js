import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { previewServer } from "../scripts/preview.js";

const server = await previewServer(0);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
await mkdir("test-results", { recursive: true });
const errors = [];
const adminId = "00000000-0000-4000-8000-000000000001";
const memberId = "00000000-0000-4000-8000-000000000002";
const user = { id: adminId, email: "ranger@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: adminId, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`;
const token = { access_token: jwt, token_type: "bearer", expires_in: 3600, refresh_token: "test-refresh", user };
const now = new Date();
const at = (day, hour) => new Date(now.getFullYear(), now.getMonth(), day, hour).toISOString();
let role = "member", approved = false, failEvents = false, eventReads = 0;
let events = [{ id: "e1", title: "Club Net", starts_at: at(12, 19), ends_at: at(12, 20), location: "On the air", description: "Members welcome." }, { id: "e2", title: "<img src=x onerror=alert(1)>", starts_at: at(15, 10), ends_at: at(17, 0), location: "Field station", description: "Portable outing" }];
let members = [{ user_id: adminId, email: user.email, approved: true, role: "admin" }, { user_id: memberId, email: "pending@example.test", approved: false, role: "member" }];
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: "America/Chicago" });
const page = await context.newPage();
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
page.on("dialog", dialog => dialog.accept());
await context.route("https://fonts.googleapis.com/**", route => route.fulfill({ contentType: "text/css", body: "" }));
const visible = id => page.locator(`#${id}`).waitFor({ state: "visible" });
const hidden = id => page.locator(`#${id}`).waitFor({ state: "hidden" });
const status = text => page.waitForFunction(text => document.getElementById("status").textContent.includes(text), text);
async function noOverflow() {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "page must fit viewport");
}
async function login() {
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill("test-password-123");
  await page.locator("#auth-submit").click();
}
try {
  await page.goto(`${origin}/members.html`);
  await status("being prepared");
  await hidden("auth-panel"); await hidden("calendar-panel");
  await page.screenshot({ path: "test-results/unconfigured-desktop.png", fullPage: true });
  await context.route("**/js/config.js", route => route.fulfill({ contentType: "text/javascript", body: `window.RDRARC_CONFIG={supabaseUrl:'https://club.supabase.co',supabasePublishableKey:'sb_publishable_test'};` }));
  await context.route("https://club.supabase.co/**", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const single = request.headers().accept?.includes("vnd.pgrst.object");
    const answer = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname === "/auth/v1/token") return answer(token);
    if (url.pathname === "/auth/v1/signup") return answer({ user, session: null });
    if (url.pathname === "/auth/v1/recover") return answer({});
    if (url.pathname === "/auth/v1/user") return answer(user);
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });
    if (url.pathname === "/rest/v1/members") {
      if (method === "PATCH") {
        const id = url.searchParams.get("user_id").slice(3);
        const target = members.find(member => member.user_id === id);
        Object.assign(target, request.postDataJSON());
        return answer({ user_id: id });
      }
      return answer(single ? { user_id: adminId, email: user.email, approved, role } : members);
    }
    if (url.pathname === "/rest/v1/events") {
      if (method === "GET") {
        eventReads++;
        if (failEvents) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
        const end = url.searchParams.get("starts_at").slice(3), start = url.searchParams.get("ends_at").slice(3);
        return answer(events.filter(event => new Date(event.starts_at) < new Date(end) && new Date(event.ends_at) > new Date(start)));
      }
      if (method === "POST") {
        const event = { ...request.postDataJSON(), id: "e3" }; events.push(event); return answer({ id: event.id });
      }
      const id = url.searchParams.get("id").slice(3);
      if (method === "PATCH") Object.assign(events.find(event => event.id === id), request.postDataJSON());
      if (method === "DELETE") events = events.filter(event => event.id !== id);
      return answer({ id });
    }
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
  await page.reload(); await visible("auth-panel");
  await page.locator("#show-signup").click();
  await login(); await status("confirmation email");
  await page.locator("#show-reset").click(); await page.locator("#auth-submit").click(); await status("password reset email");
  await page.locator("#show-login").click(); await login();
  await status("awaiting club approval");
  assert.equal(eventReads, 0, "pending members must not request events");
  await hidden("calendar-panel"); await hidden("admin-panel");
  approved = true;
  await page.locator("#refresh").click(); await visible("calendar-panel"); await status("Calendar loaded");
  assert.equal(await page.locator(".event-card").count(), 2);
  assert.equal(await page.locator(".event-card img").count(), 0, "event text must not become executable HTML");
  await hidden("admin-panel");
  await noOverflow();
  await page.screenshot({ path: "test-results/member-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 }); await noOverflow();
  await page.screenshot({ path: "test-results/member-mobile.png", fullPage: true });
  await page.locator("#next-month").click(); await visible("empty-events");
  await page.locator("#previous-month").click(); await status("Calendar loaded");
  assert.equal(await page.locator(".event-card").count(), 2);
  await page.reload(); await visible("calendar-panel");
  // Revoked access must clear previously rendered private data.
  approved = false; await page.locator("#refresh").click(); await status("awaiting club approval");
  assert.equal(await page.locator(".event-card").count(), 0);
  approved = true; role = "admin";
  await page.locator("#refresh").click(); await visible("admin-panel");
  await noOverflow();
  await page.locator(".member-card").filter({ hasText: "pending@example.test" }).getByRole("button", { name: "Approve member" }).click();
  await page.locator(".member-card").filter({ hasText: "pending@example.test" }).getByRole("button", { name: "Revoke access" }).waitFor();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-20`;
  await page.locator("#event-title").fill("Field Day");
  await page.locator("#event-start").fill(`${date}T09:00`);
  await page.locator("#event-end").fill(`${date}T08:00`);
  await page.locator("#save-event").click(); await status("end after");
  await page.locator("#event-end").fill(`${date}T12:00`);
  await page.locator("#save-event").click(); await status("Event saved");
  assert.equal(events.length, 3);
  const fieldDay = page.locator(".event-card").filter({ hasText: "Field Day" });
  await fieldDay.getByRole("button", { name: "Edit event" }).click();
  await page.locator("#event-title").fill("Field Day revised");
  await page.locator("#save-event").click(); await status("Event saved");
  assert.equal(events.find(event => event.id === "e3").title, "Field Day revised");
  await page.locator(".event-card").filter({ hasText: "Field Day revised" }).getByRole("button", { name: "Delete event" }).click();
  await status("Event deleted"); assert.equal(events.length, 2);
  failEvents = true; await page.locator("#refresh").click(); await page.locator("#status.error").waitFor();
  await hidden("calendar-panel");
  failEvents = false; await page.locator("#refresh").click(); await visible("admin-panel");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/admin-desktop.png", fullPage: true });
  await page.locator("#signout").click(); await visible("auth-panel");
  assert.equal(await page.locator(".event-card").count(), 0);
  await page.reload(); await visible("auth-panel");
  // Exercise the real SDK's password-recovery redirect handling.
  await page.goto(origin);
  await page.goto(`${origin}/members.html#access_token=${jwt}&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery`);
  await visible("recovery-panel"); await hidden("calendar-panel");
  await page.reload(); await visible("recovery-panel"); await hidden("calendar-panel");
  await page.locator("#new-password").fill("replacement-password-123");
  await page.locator("#recovery-form button").click(); await status("password has been updated");
  await visible("calendar-panel");
  await page.goto(origin);
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow();
  }
  await page.locator("#menu").click(); assert.equal(await page.locator("#menu").getAttribute("aria-expanded"), "true");
  await page.locator("nav a[href='#about']").click(); assert.equal(await page.locator("#menu").getAttribute("aria-expanded"), "false");
  const hrefs = await page.locator("a[href^='#']").evaluateAll(links => links.map(link => link.getAttribute("href").slice(1)));
  for (const id of hrefs) assert.equal(await page.locator(`[id="${id}"]`).count(), 1);
  assert.deepEqual(errors, [], "no browser errors");
  console.log("Browser checks passed: unconfigured state, signup, reset, login, approval, calendar, mobile layout, admin CRUD, signout, recovery, navigation and console.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
