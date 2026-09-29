import { monthBounds, monthDays, eventsOnDay, localInput, eventPayload } from "./calendar.js";

const $ = id => document.getElementById(id);
const recoveryStorageKey = "rdrarc-password-recovery-user";
let client, session, profile, recovery = false, authMode = "login", revision = 0;
let month = monthBounds(new Date()).start;
const notice = (message, error = false) => {
  $("status").textContent = message;
  $("status").classList.toggle("error", error);
};
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (text, handler) => {
  const node = element("button", text, "btn");
  node.type = "button";
  node.addEventListener("click", () => run(node, handler));
  return node;
};
async function run(control, action) {
  control.disabled = true;
  try { await action(); }
  catch (error) { notice(error.message || "Unable to complete the request. Please try again.", true); }
  finally { control.disabled = false; }
}
function clearPrivateContent() {
  profile = null;
  for (const id of ["calendar-panel", "admin-panel"]) $(id).hidden = true;
  for (const id of ["calendar-days", "event-list", "member-list"]) $(id).replaceChildren();
  resetEventForm();
}
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup", reset = mode === "reset";
  $("auth-heading").textContent = signup ? "Request membership" : reset ? "Reset your password" : "Member login";
  $("auth-help").textContent = signup ? "Create an account, confirm your email, and wait for club administrator approval. Use a password of at least 12 characters." : reset ? "Enter your account email to receive a password reset link." : "Sign in with your email and password. Calendar access requires club approval.";
  $("auth-submit").textContent = signup ? "Create account" : reset ? "Send reset link" : "Sign in";
  $("password-field").hidden = reset;
  $("password").required = !reset;
  $("password").disabled = reset;
  $("password").minLength = signup ? 12 : 1;
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("password").value = "";
}

async function loadMemberArea() {
  const request = ++revision;
  clearPrivateContent();
  $("auth-panel").hidden = !!session;
  $("account-panel").hidden = !session;
  $("account-email").textContent = session?.user.email || "";
  $("recovery-panel").hidden = !recovery || !session;
  if (!session) { notice("Sign in to view the member calendar."); return; }
  if (recovery) { notice("Choose a new password to finish recovering your account."); return; }
  notice("Loading your membership and calendar…");
  try {
    const member = await client.from("members").select("user_id,email,approved,role").eq("user_id", session.user.id).single();
    if (request !== revision) return;
    if (member.error) throw new Error("Unable to load your membership. Please refresh or contact the club administrator.");
    profile = member.data;
    if (!profile.approved) { notice("Your account is awaiting club approval. Use Refresh after an administrator approves your membership."); return; }
    const { start, end } = monthBounds(month);
    const events = await readAll(() => client.from("events").select("id,title,starts_at,ends_at,location,description").lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).order("starts_at").order("id"));
    if (request !== revision) return;
    renderCalendar(events);
    $("calendar-panel").hidden = false;
    if (profile.role === "admin") {
      const members = await readAll(() => client.from("members").select("user_id,email,approved,role").order("created_at").order("user_id"));
      if (request !== revision) return;
      renderMembers(members);
      $("admin-panel").hidden = false;
    }
    notice("Calendar loaded. Use the month controls to browse events.");
  } catch (error) {
    if (request !== revision) return;
    clearPrivateContent();
    notice(error.message || "Unable to load the calendar. Please try Refresh.", true);
  }
}

// Fetch every page so a busy calendar or a large membership list is not silently cut off.
async function readAll(query) {
  const rows = [], size = 100;
  for (let offset = 0; ; offset += size) {
    const result = await query().range(offset, offset + size - 1);
    if (result.error || !Array.isArray(result.data)) throw new Error("Unable to load club data. Please check your connection and try Refresh.");
    rows.push(...result.data);
    if (result.data.length < size) return rows;
  }
}

function renderCalendar(events) {
  $("month-heading").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  $("timezone-note").textContent = `All dates and times are shown in your local time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  const today = new Date().toDateString();
  let row;
  monthDays(month).forEach((day, index) => {
    if (index % 7 === 0) { row = element("tr"); $("calendar-days").append(row); }
    const cell = element("td"); row.append(cell);
    if (!day) return;
    const number = element("span", String(day.getDate()), "day-number");
    if (day.toDateString() === today) { number.classList.add("current-day"); number.setAttribute("aria-current", "date"); }
    cell.append(number);
    for (const event of eventsOnDay(events, day)) {
      const link = element("a", event.title, "day-event");
      link.href = `#event-${event.id}`;
      cell.append(link);
    }
  });
  $("empty-events").hidden = events.length !== 0;
  const format = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  for (const event of events) {
    const card = element("article", undefined, "event-card");
    card.id = `event-${event.id}`;
    card.append(element("h3", event.title), element("p", `${format.format(new Date(event.starts_at))} – ${format.format(new Date(event.ends_at))}`));
    if (event.location) card.append(element("p", event.location));
    if (event.description) card.append(element("p", event.description));
    if (profile.role === "admin") {
      card.append(button("Edit event", () => editEvent(event)), button("Delete event", async () => {
        if (!window.confirm(`Delete “${event.title}”? This cannot be undone.`)) return;
        const result = await client.from("events").delete().eq("id", event.id).select("id").single();
        if (result.error) throw new Error("The event was not deleted. Refresh to check your permissions and try again.");
        await loadMemberArea();
        notice("Event deleted.");
      }));
    }
    $("event-list").append(card);
  }
}

function renderMembers(members) {
  for (const member of members) {
    const card = element("div", undefined, "member-card");
    card.append(element("strong", member.email), element("p", `${member.role === "admin" ? "Administrator" : "Member"} · ${member.approved ? "Approved" : "Awaiting approval"}`));
    // Administrator changes use the owner-controlled database procedure in the setup guide.
    if (member.role !== "admin") card.append(button(member.approved ? "Revoke access" : "Approve member", async () => {
      if (member.approved && !window.confirm(`Revoke calendar access for ${member.email}?`)) return;
      const result = await client.from("members").update({ approved: !member.approved }).eq("user_id", member.user_id).select("user_id").single();
      if (result.error) throw new Error("Membership was not updated. Refresh and try again.");
      await loadMemberArea();
    }));
    $("member-list").append(card);
  }
}

function resetEventForm() {
  $("event-form").reset();
  $("event-id").value = "";
  $("save-event").textContent = "Add event";
  $("cancel-edit").hidden = true;
}
function editEvent(event) {
  $("event-id").value = event.id;
  $("event-title").value = event.title;
  $("event-start").value = localInput(event.starts_at);
  $("event-end").value = localInput(event.ends_at);
  $("event-location").value = event.location;
  $("event-description").value = event.description;
  $("save-event").textContent = "Save changes";
  $("cancel-edit").hidden = false;
  $("event-title").focus();
}

function wireControls() {
  for (const mode of ["login", "signup", "reset"]) $("show-" + mode).addEventListener("click", () => setAuthMode(mode));
  $("auth-form").addEventListener("submit", event => {
    event.preventDefault();
    run($("auth-submit"), async () => {
      const email = $("email").value.trim(), password = $("password").value;
      const redirectTo = new URL("members.html", window.location.href).href;
      let result;
      if (authMode === "signup") {
        result = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (result.error) throw result.error;
        notice("If this address is eligible, a confirmation email is on its way. Confirm your email, then sign in. Club approval is required before viewing events.");
      } else if (authMode === "reset") {
        result = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (result.error) throw result.error;
        notice("If an account exists for this address, you will receive a password reset email.");
      } else {
        result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error("Unable to sign in. Check your email and password, and confirm your email before trying again.");
      }
      $("password").value = "";
    });
  });
  $("signout").addEventListener("click", () => run($("signout"), async () => {
    // Clear member data immediately, even if the server cannot be reached.
    ++revision; clearPrivateContent();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Sign out could not finish. Please retry; close this tab if using a shared computer.");
    session = null; recovery = false;
    await loadMemberArea();
  }));
  $("refresh").addEventListener("click", () => run($("refresh"), loadMemberArea));
  for (const [id, offset] of [["previous-month", -1], ["next-month", 1], ["today", 0]]) {
    $(id).addEventListener("click", () => {
      month = offset ? new Date(month.getFullYear(), month.getMonth() + offset, 1) : monthBounds(new Date()).start;
      void loadMemberArea();
    });
  }
  $("cancel-edit").addEventListener("click", resetEventForm);
  $("event-form").addEventListener("submit", event => {
    event.preventDefault();
    run($("save-event"), async () => {
      const payload = eventPayload({ title: $("event-title").value, start: $("event-start").value, end: $("event-end").value, location: $("event-location").value, description: $("event-description").value });
      const id = $("event-id").value;
      const query = id ? client.from("events").update(payload).eq("id", id) : client.from("events").insert(payload);
      const result = await query.select("id").single();
      if (result.error) throw new Error("The event was not saved. Check your connection and administrator access, then try again.");
      month = monthBounds(new Date(payload.starts_at)).start;
      await loadMemberArea();
      notice("Event saved.");
    });
  });
  $("recovery-form").addEventListener("submit", event => {
    event.preventDefault();
    run(event.submitter, async () => {
      const { error } = await client.auth.updateUser({ password: $("new-password").value });
      if (error) throw error;
      $("recovery-form").reset(); recovery = false;
      window.sessionStorage.removeItem(recoveryStorageKey);
      await loadMemberArea();
      notice("Your password has been updated.");
    });
  });
}

function initialize() {
  const config = window.RDRARC_CONFIG;
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    notice("Member access is being prepared. Please check back soon; the public club website is still available.");
    return;
  }
  try {
    const url = new URL(config.supabaseUrl);
    if (url.protocol !== "https:" || config.supabasePublishableKey.startsWith("sb_secret_")) throw new Error("Invalid public configuration");
    client = window.supabase.createClient(url.href, config.supabasePublishableKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    wireControls();
    client.auth.onAuthStateChange((event, nextSession) => {
      const previousUser = session?.user.id;
      session = nextSession;
      if (event === "PASSWORD_RECOVERY" && session) window.sessionStorage.setItem(recoveryStorageKey, session.user.id);
      recovery = !!session && window.sessionStorage.getItem(recoveryStorageKey) === session.user.id;
      if (!session) window.sessionStorage.removeItem(recoveryStorageKey);
      if (event === "SIGNED_OUT" || previousUser !== session?.user.id) { ++revision; clearPrivateContent(); }
      // SDK callbacks hold an auth lock: defer database calls until it is released.
      if (["INITIAL_SESSION", "SIGNED_OUT", "PASSWORD_RECOVERY", "TOKEN_REFRESHED"].includes(event) || (event === "SIGNED_IN" && previousUser !== session?.user.id)) {
        setTimeout(() => void loadMemberArea(), 0);
      }
    });
  } catch {
    notice("Member access is temporarily unavailable. Please contact the club administrator.", true);
  }
}
initialize();
