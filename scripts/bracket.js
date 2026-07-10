/**
 * World Cup 2026 knockout bracket propagation.
 * Fills later-round match slots from winners (or losers for third-place)
 * once feeder matches have a recorded result.
 *
 * Match indices match the fixed order in predictions/predictions.yml.
 */

function parseActualResult(actualResult) {
  const parsed = (actualResult || "").match(/^(.+?)\s+(\d+)-(\d+)\s+(.+)$/);
  if (!parsed) return null;
  return {
    team1: parsed[1].trim(),
    score1: Number(parsed[2]),
    team2: parsed[4].trim(),
    score2: Number(parsed[3]),
  };
}

function getMatchWinner(match) {
  if (!match?.actual_result) return null;
  const parsed = parseActualResult(match.actual_result);
  if (!parsed) return null;
  if (parsed.score1 > parsed.score2) return parsed.team1;
  if (parsed.score2 > parsed.score1) return parsed.team2;
  return null;
}

function getMatchLoser(match) {
  if (!match?.actual_result) return null;
  const parsed = parseActualResult(match.actual_result);
  if (!parsed) return null;
  if (parsed.score1 > parsed.score2) return parsed.team2;
  if (parsed.score2 > parsed.score1) return parsed.team1;
  return null;
}

/** @type {Array<{ idx: number, homeFrom?: number, awayFrom?: number, homeLoserFrom?: number, awayLoserFrom?: number }>} */
const PROPAGATION_RULES = [
  { idx: 8, homeFrom: 0, awayFrom: 1 },
  { idx: 9, homeFrom: 2, awayFrom: 3 },
  { idx: 10, homeFrom: 4, awayFrom: 5 },
  { idx: 11, homeFrom: 6, awayFrom: 7 },
  { idx: 12, homeFrom: 8, awayFrom: 9 },
  { idx: 13, homeFrom: 10, awayFrom: 11 },
  { idx: 14, homeLoserFrom: 12, awayLoserFrom: 13 },
  { idx: 15, homeFrom: 12, awayFrom: 13 },
];

function applyRule(matches, rule) {
  const slot = matches[rule.idx];
  if (!slot) return;

  if (rule.homeFrom != null) {
    const winner = getMatchWinner(matches[rule.homeFrom]);
    if (winner) slot.home = winner;
  }
  if (rule.awayFrom != null) {
    const winner = getMatchWinner(matches[rule.awayFrom]);
    if (winner) slot.away = winner;
  }
  if (rule.homeLoserFrom != null) {
    const loser = getMatchLoser(matches[rule.homeLoserFrom]);
    if (loser) slot.home = loser;
  }
  if (rule.awayLoserFrom != null) {
    const loser = getMatchLoser(matches[rule.awayLoserFrom]);
    if (loser) slot.away = loser;
  }
}

function propagateBracket(matches) {
  for (const rule of PROPAGATION_RULES) {
    applyRule(matches, rule);
  }
}

module.exports = {
  propagateBracket,
  getMatchWinner,
  getMatchLoser,
  parseActualResult,
};
