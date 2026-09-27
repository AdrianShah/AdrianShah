/**
 * Team-name matching across sources ("Olympiacos BC" vs "Olympiacos",
 * "Bayern München" vs "Bayern Munich" won't match; that's fine, it only
 * decides duplicates and favourites, never scoring).
 */

const SUFFIXES = /\b(fc|bc|cf|afc|sc|bk|kk|ac|as|cd|sk|fk|bb|b\.c\.|f\.c\.)\b/g;

function normalizeTeam(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameTeam(x, y) {
  const a = normalizeTeam(x);
  const b = normalizeTeam(y);
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

const SPORT_FAMILY = { nba: "basketball", nhl: "hockey" };
const family = (s) => SPORT_FAMILY[s] || s;

/** Same fixture from two sources: same sport family, teams, and start within 3h. */
function sameGame(e1, e2) {
  return (
    family(e1.sport) === family(e2.sport) &&
    Math.abs(Date.parse(e1.scheduledAt) - Date.parse(e2.scheduledAt)) <= 3 * 3600 * 1000 &&
    ((sameTeam(e1.a, e2.a) && sameTeam(e1.b, e2.b)) || (sameTeam(e1.a, e2.b) && sameTeam(e1.b, e2.a)))
  );
}

module.exports = { normalizeTeam, sameTeam, sameGame, family };
