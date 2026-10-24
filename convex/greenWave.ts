import { action, mutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type GHHeaders = Record<string, string>;

function makeHeaders(token: string): GHHeaders {
  return {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "github-green-wave-convex",
  };
}

async function ghFetch(
  url: string,
  options: { method?: string; headers: GHHeaders; body?: string }
) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

export const writeLog = mutation({
  args: {
    status: v.union(
      v.literal("success"),
      v.literal("skipped"),
      v.literal("error")
    ),
    message: v.string(),
    sha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("commitLog", {
      timestamp: Date.now(),
      status: args.status,
      message: args.message,
      sha: args.sha,
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// GitHub helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Update or create a file directly on a branch (makes one commit). */
async function pushFileCommit(
  headers: GHHeaders,
  owner: string, repo: string, branch: string,
  filename: string, content: string,
  authorName: string, authorEmail: string, commitMessage: string
): Promise<string> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  // Get existing file SHA if it exists
  const getRes = await ghFetch(`${base}/contents/${filename}?ref=${branch}`, { headers });
  const currentSha = getRes.status === 200
    ? (getRes.json as { sha: string }).sha
    : undefined;

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: btoa(content),
    branch,
    committer: { name: authorName, email: authorEmail },
    author:    { name: authorName, email: authorEmail },
  };
  if (currentSha) body.sha = currentSha;

  const putRes = await ghFetch(`${base}/contents/${filename}`, {
    method: "PUT", headers, body: JSON.stringify(body),
  });
  if (putRes.status !== 200 && putRes.status !== 201) {
    throw new Error(`File PUT failed (${putRes.status}): ${putRes.text}`);
  }
  return (putRes.json as { commit: { sha: string } }).commit.sha;
}

/** Open an issue then immediately close it. Returns the issue number. */
async function doIssue(
  headers: GHHeaders,
  owner: string, repo: string, date: string
): Promise<number> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  // Create issue
  const createRes = await ghFetch(`${base}/issues`, {
    method: "POST", headers,
    body: JSON.stringify({
      title: `Daily maintenance check — ${date}`,
      body:  "Automated daily maintenance issue. Closed automatically.",
    }),
  });
  if (createRes.status !== 201) {
    throw new Error(`Issue create failed (${createRes.status}): ${createRes.text}`);
  }
  const issueNumber = (createRes.json as { number: number }).number;

  // Close it immediately
  const closeRes = await ghFetch(`${base}/issues/${issueNumber}`, {
    method: "PATCH", headers,
    body: JSON.stringify({ state: "closed" }),
  });
  if (closeRes.status !== 200) {
    throw new Error(`Issue close failed (${closeRes.status}): ${closeRes.text}`);
  }
  return issueNumber;
}

/**
 * Create a branch → commit a file → open a PR → merge it → delete branch.
 * Returns the PR number.
 */
async function doPR(
  headers: GHHeaders,
  owner: string, repo: string, baseBranch: string,
  filename: string, authorName: string, authorEmail: string, date: string
): Promise<number> {
  const base = `https://api.github.com/repos/${owner}/${repo}`;
  const prBranch = `auto/green-wave-${Date.now()}`;

  // 1. Get SHA of the tip of base branch
  const refRes = await ghFetch(
    `${base}/git/ref/heads/${baseBranch}`, { headers }
  );
  if (refRes.status !== 200) {
    throw new Error(`Get branch ref failed (${refRes.status}): ${refRes.text}`);
  }
  const baseSha = (refRes.json as { object: { sha: string } }).object.sha;

  // 2. Create new branch from that SHA
  const branchRes = await ghFetch(`${base}/git/refs`, {
    method: "POST", headers,
    body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: baseSha }),
  });
  if (branchRes.status !== 201) {
    throw new Error(`Branch create failed (${branchRes.status}): ${branchRes.text}`);
  }

  // 3. Commit the file onto the new branch
  await pushFileCommit(
    headers, owner, repo, prBranch,
    filename, new Date().toISOString(),
    authorName, authorEmail, `chore: daily update — ${date}`
  );

  // 4. Open a pull request
  const prRes = await ghFetch(`${base}/pulls`, {
    method: "POST", headers,
    body: JSON.stringify({
      title: `Daily automated update — ${date}`,
      body:  "Automated PR created and merged by green wave.",
      head:  prBranch,
      base:  baseBranch,
    }),
  });
  if (prRes.status !== 201) {
    throw new Error(`PR create failed (${prRes.status}): ${prRes.text}`);
  }
  const prNumber = (prRes.json as { number: number }).number;

  // 5. Merge the pull request
  const mergeRes = await ghFetch(`${base}/pulls/${prNumber}/merge`, {
    method: "PUT", headers,
    body: JSON.stringify({
      merge_method: "squash",
      commit_title: `Daily automated update — ${date}`,
    }),
  });
  if (mergeRes.status !== 200) {
    throw new Error(`PR merge failed (${mergeRes.status}): ${mergeRes.text}`);
  }

  // 6. Delete the temp branch (cleanup)
  await ghFetch(`${base}/git/refs/heads/${prBranch}`, {
    method: "DELETE", headers,
  });

  return prNumber;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core action
// ─────────────────────────────────────────────────────────────────────────────

export const runGreenWave = internalAction({
  args: {
    triggeredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Load settings
    const settings = await ctx.runQuery(api.settings.getSettings);
    if (!settings) {
      await ctx.runMutation(api.greenWave.writeLog, {
        status: "error",
        message: "Settings not initialized. Open the dashboard and click 'Initialize Settings'.",
      });
      return;
    }

    // 2. Schedule enabled check
    if (!settings.scheduleEnabled) {
      await ctx.runMutation(api.greenWave.writeLog, {
        status: "skipped",
        message: "Schedule is disabled.",
      });
      return;
    }

    // 3. Probability check
    const randomChance = Math.random();
    if (randomChance > settings.probability) {
      await ctx.runMutation(api.greenWave.writeLog, {
        status: "skipped",
        message: `Skipped — probability check failed (${randomChance.toFixed(4)} > ${settings.probability})`,
      });
      return;
    }

    // 4. Load token
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      await ctx.runMutation(api.greenWave.writeLog, {
        status: "error",
        message: "GITHUB_TOKEN environment variable is not set in Convex.",
      });
      return;
    }

    const { repoOwner, repoName, branch, filename, authorName, authorEmail, commitMessage } = settings;
    const headers = makeHeaders(token);
    const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const results: string[] = [];

    // 5. Direct commit (always runs when probability passes)
    try {
      const sha = await pushFileCommit(
        headers, repoOwner, repoName, branch,
        filename, new Date().toISOString(),
        authorName, authorEmail, commitMessage
      );
      results.push(`commit:${sha.slice(0, 7)}`);
      console.log(`✅ Commit: ${sha.slice(0, 7)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`commit:ERROR(${msg})`);
      console.error("Commit error:", msg);
    }

    // 6. Issue: open + close
    if (settings.createIssues ?? true) {
      try {
        const issueNum = await doIssue(headers, repoOwner, repoName, date);
        results.push(`issue:#${issueNum}`);
        console.log(`✅ Issue #${issueNum} opened and closed`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`issue:ERROR(${msg})`);
        console.error("Issue error:", msg);
      }
    }

    // 7. PR: branch → commit → PR → merge → delete branch
    if (settings.createPRs ?? true) {
      try {
        const prNum = await doPR(
          headers, repoOwner, repoName, branch,
          filename, authorName, authorEmail, date
        );
        results.push(`pr:#${prNum}`);
        console.log(`✅ PR #${prNum} created and merged`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`pr:ERROR(${msg})`);
        console.error("PR error:", msg);
      }
    }

    // 8. Write summary log
    const hasError = results.some(r => r.includes("ERROR"));
    await ctx.runMutation(api.greenWave.writeLog, {
      status: hasError ? "error" : "success",
      message: `✅ Done [${args.triggeredBy ?? "cron"}]: ${results.join(" | ")}`,
      sha: results[0]?.replace("commit:", ""),
    });
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Public trigger
// ─────────────────────────────────────────────────────────────────────────────

export const triggerManualRun = action({
  args: {},
  handler: async (ctx) => {
    await ctx.runAction(internal.greenWave.runGreenWave, { triggeredBy: "manual" });
    return { ok: true };
  },
});
