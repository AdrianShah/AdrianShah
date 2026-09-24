/**
 * Timezone helpers. Every "today" is computed in America/Toronto;
 * timestamps are stored in UTC ISO strings.
 */

const TZ = "America/Toronto";

function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

module.exports = { TZ, localDate, formatDate, formatTime, isoDay, addDays };
