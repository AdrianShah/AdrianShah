/**
 * Rebuilds the auto-generated "Pitchside Commits" section in README.md.
 *
 * Pulls recent PushEvent commits from public repos via the GitHub Events API,
 * excluding this profile repo (owner/owner).
 *
 * Requires: GITHUB_TOKEN and GITHUB_REPOSITORY_OWNER env vars.
 */

const START_MARKER = "<!-- COMMITS:AUTO:START -->";
const END_MARKER = "<!-- COMMITS:AUTO:END -->";
const MAX_COMMITS = 8;

function escapeCell(text) {
  return (text || "").replace(/\|/g, "-").replace(/\n/g, " ").trim();
}

function truncate(text, maxLen) {
  const clean = escapeCell(text);
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchCommit(repoFullName, sha, token) {
  try {
    const commit = await fetchJson(
      `https://api.github.com/repos/${repoFullName}/commits/${sha}`,
      token
    );
    return {
      sha: commit.sha,
      message: commit.commit?.message || "",
    };
  } catch {
    return { sha, message: "" };
  }
}

async function collectRecentCommits(owner, token) {
  const profileRepo = `${owner}/${owner}`.toLowerCase();
  const seen = new Set();
  const commits = [];
  let page = 1;

  while (commits.length < MAX_COMMITS && page <= 5) {
    const events = await fetchJson(
      `https://api.github.com/users/${owner}/events/public?per_page=100&page=${page}`,
      token
    );

    if (!events.length) break;

    for (const event of events) {
      if (event.type !== "PushEvent") continue;
      if ((event.repo?.name || "").toLowerCase() === profileRepo) continue;

      const repoName = event.repo.name;
      const repoUrl = `https://github.com/${repoName}`;
      const pushCommits = event.payload?.commits || [];
      const headSha = event.payload?.head;

      const commitEntries =
        pushCommits.length > 0
          ? pushCommits.map((c) => ({ sha: c.sha, message: c.message }))
          : headSha
            ? [await fetchCommit(repoName, headSha, token)]
            : [];

      for (const commit of commitEntries) {
        const sha = commit.sha;
        if (!sha || seen.has(sha)) continue;
        seen.add(sha);

        commits.push({
          when: event.created_at.slice(0, 10),
          repo: repoName.split("/")[1],
          repoUrl,
          sha: sha.slice(0, 7),
          commitUrl: `${repoUrl}/commit/${sha}`,
          message: commit.message,
        });

        if (commits.length >= MAX_COMMITS) break;
      }

      if (commits.length >= MAX_COMMITS) break;
    }

    page += 1;
  }

  return commits;
}

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !token) {
    console.error("Missing GITHUB_REPOSITORY_OWNER or GITHUB_TOKEN env vars.");
    process.exit(1);
  }

  const commits = await collectRecentCommits(owner, token);

  const rows =
    commits.length === 0
      ? ["_No recent commits found in other repos yet._"]
      : commits.map(
          (c) =>
            `| ${c.when} | [\`${c.repo}\`](${c.repoUrl}) | [\`${c.sha}\`](${c.commitUrl}) | ${truncate(c.message, 60)} |`
        );

  const table = [
    "| When | Repo | Commit | Message |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n");

  const fs = require("fs");
  const readmePath = "README.md";
  const readme = fs.readFileSync(readmePath, "utf8");

  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error("Pitchside Commits markers not found in README.md");
    process.exit(1);
  }

  const before = readme.slice(0, startIdx + START_MARKER.length);
  const after = readme.slice(endIdx);

  fs.writeFileSync(readmePath, `${before}\n${table}\n${after}`);
  console.log("Pitchside Commits section updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
