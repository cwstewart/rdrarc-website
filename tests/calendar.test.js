import test from "node:test";
import assert from "node:assert/strict";
import { monthBounds, monthDays, eventsOnDay, eventPayload } from "../js/calendar.js";

process.env.TZ = "America/Chicago";
test("calendar includes every date, leap day, and full weeks", () => {
  for (const [year, month, days] of [[2024, 1, 29], [2025, 1, 28], [2026, 7, 31], [2026, 8, 30]]) {
    const cells = monthDays(new Date(year, month, 1));
    assert.equal(cells.length % 7, 0);
    assert.equal(cells.filter(Boolean).length, days);
    assert.deepEqual(cells.filter(Boolean).map(d => d.getDate()), Array.from({ length: days }, (_, i) => i + 1));
  }
});
test("month navigation crosses years", () => {
  assert.equal(monthBounds(new Date(2026, 11, 19)).end.getFullYear(), 2027);
  assert.equal(monthBounds(new Date(2026, 11, 19)).end.getMonth(), 0);
});
test("multi-day events overlap days but exclude the ending midnight", () => {
  const events = [{ starts_at: "2026-09-30T23:00:00-05:00", ends_at: "2026-10-02T00:00:00-05:00" }];
  assert.equal(eventsOnDay(events, new Date(2026, 8, 30)).length, 1);
  assert.equal(eventsOnDay(events, new Date(2026, 9, 1)).length, 1);
  assert.equal(eventsOnDay(events, new Date(2026, 9, 2)).length, 0);
});
test("dates respect a 23-hour daylight-saving day", () => {
  const events = [{ starts_at: "2026-03-09T00:30:00-05:00", ends_at: "2026-03-09T01:30:00-05:00" }];
  assert.equal(eventsOnDay(events, new Date(2026, 2, 8)).length, 0);
});
test("event validation rejects invalid ranges and nonexistent DST times", () => {
  const values = { title: " Net ", start: "2026-09-29T19:00", end: "2026-09-29T20:00", location: " HF ", description: " Details " };
  assert.equal(eventPayload(values).starts_at, "2026-09-30T00:00:00.000Z");
  assert.equal(eventPayload(values).title, "Net");
  assert.throws(() => eventPayload({ ...values, end: values.start }), /end after/);
  assert.throws(() => eventPayload({ ...values, title: " " }), /title/);
  assert.throws(() => eventPayload({ ...values, start: "2026-03-08T02:30", end: "2026-03-08T04:00" }), /does not exist/);
});
