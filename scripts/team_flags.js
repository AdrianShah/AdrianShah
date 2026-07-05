/**
 * Country name to ISO 3166-1 alpha-2 codes for World Cup teams in predictions.yml.
 * Codes are lowercase for flagcdn.com URLs (gb-eng for England).
 */

const TEAM_FLAGS = {
  morocco: "ma",
  canada: "ca",
  france: "fr",
  paraguay: "py",
  brazil: "br",
  norway: "no",
  mexico: "mx",
  england: "gb-eng",
  portugal: "pt",
  spain: "es",
  usa: "us",
  belgium: "be",
  argentina: "ar",
  egypt: "eg",
  switzerland: "ch",
  colombia: "co",
};

function normalize(name) {
  return (name || "").toLowerCase().trim();
}

function escapeHtml(text) {
  return (text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flagImg(countryName, size = 20) {
  const code = TEAM_FLAGS[normalize(countryName)];
  if (!code) return "";
  const alt = escapeHtml(countryName);
  return `<img src="https://flagcdn.com/w${size}/${code}.png" width="${size}" alt="${alt}" />`;
}

function teamCell(name) {
  const label = name || "TBD";
  if (!name || name === "TBD") {
    return `<div align="center"><br/>${escapeHtml(label)}</div>`;
  }
  const img = flagImg(name);
  if (!img) {
    return `<div align="center"><br/>${escapeHtml(label)}</div>`;
  }
  return `<div align="center">${img}<br/>${escapeHtml(label)}</div>`;
}

module.exports = { TEAM_FLAGS, flagImg, teamCell };
