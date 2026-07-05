/**
 * Rebuilds the auto-generated part of the "Trophy Cabinet" section in README.md.
 *
 * What this script DOES automate:
 *   - Pulls your most recently pushed-to public repos via the GitHub REST API
 *     and lists them with a short blurb + last-updated date.
 *
 * What this script CANNOT automate (no API exists for this):
 *   - Past competition results, placements, or team breakdowns (e.g. your
 *     Elenchus win). Those live in the STATIC block above the markers in
 *     README.md — edit that block by hand whenever you want to add a new
 *     static highlight.
 *
 * Requires: GITHUB_TOKEN env var (the default Actions token is enough for
 * public repo reads) and GITHUB_REPOSITORY_OWNER env var (set automatically
 * in GitHub Actions).
 */

const START_MARKER = "<!-- TROPHY:AUTO:START -->";
const END_MARKER = "<!-- TROPHY:AUTO:END -->";

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !token) {
    console.error("Missing GITHUB_REPOSITORY_OWNER or GITHUB_TOKEN env vars.");
    process.exit(1);
  }

  const res = await fetch(
    `https://api.github.com/users/${owner}/repos?sort=pushed&direction=desc&per_page=6`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  if (!res.ok) {
    console.error(`GitHub API error: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const repos = await res.json();

  const rows = repos
    .filter((r) => !r.fork && !r.archived)
    .slice(0, 5)
    .map((r) => {
      const updated = new Date(r.pushed_at).toISOString().slice(0, 10);
      const desc = r.description ? r.description.replace(/\|/g, "-") : "_no description yet_";
      return `| [\`${r.name}\`](${r.html_url}) | ${desc} | ${updated} |`;
    });

  const table = [
    "| Repo | What it is | Last activity |",
    "|---|---|---|",
    ...rows,
  ].join("\n");

  const fs = require("fs");
  const readmePath = "README.md";
  const readme = fs.readFileSync(readmePath, "utf8");

  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Trophy cabinet markers not found in README.md");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);

  const newReadme = `${before}\n${table}\n${after}`;
  fs.writeFileSync(readmePath, newReadme);
  console.log("Trophy cabinet section updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
