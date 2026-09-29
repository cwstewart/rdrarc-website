export function monthBounds(month) {
  return { start: new Date(month.getFullYear(), month.getMonth(), 1), end: new Date(month.getFullYear(), month.getMonth() + 1, 1) };
}

export function monthDays(month) {
  const { start, end } = monthBounds(month);
  const count = new Date(end.getTime() - 1).getDate();
  return Array.from({ length: Math.ceil((start.getDay() + count) / 7) * 7 }, (_, index) => {
    const day = index - start.getDay() + 1;
    return day > 0 && day <= count ? new Date(start.getFullYear(), start.getMonth(), day) : null;
  });
}

export function eventsOnDay(events, day) {
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events.filter(event => new Date(event.starts_at) < end && new Date(event.ends_at) > day);
}

export function localInput(date) {
  const d = new Date(date);
  const pad = value => String(value).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function eventPayload(values) {
  const start = new Date(values.start), end = new Date(values.end);
  if (!values.title.trim()) throw new Error("Enter an event title.");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) throw new Error("The event must end after it starts.");
  if (localInput(start) !== values.start || localInput(end) !== values.end) throw new Error("That local time does not exist because of a daylight-saving change. Choose another time.");
  return { title: values.title.trim(), starts_at: start.toISOString(), ends_at: end.toISOString(), location: values.location.trim(), description: values.description.trim() };
}
