import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Stores all configuration for the green wave automation
  settings: defineTable({
    // GitHub repo details (stored as env vars, but cached here for display)
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.string(),
    filename: v.string(),

    // Commit author
    authorName: v.string(),
    authorEmail: v.string(),
    commitMessage: v.string(),

    // Automation control
    probability: v.number(),       // 0.0 - 1.0
    scheduleEnabled: v.boolean(),  // master on/off switch

    // Extra contribution activities (each counts separately on the graph)
    createIssues: v.optional(v.boolean()),  // open + close an issue daily
    createPRs: v.optional(v.boolean()),     // create branch → commit → PR → merge daily

    // Cron schedule string (e.g. "0 12 * * *" = noon UTC daily)
    cronSchedule: v.string(),
  }),

  // Logs every run attempt
  commitLog: defineTable({
    timestamp: v.number(),   // Date.now()
    status: v.union(
      v.literal("success"),
      v.literal("skipped"),
      v.literal("error")
    ),
    message: v.string(),     // human-readable result
    sha: v.optional(v.string()), // GitHub commit SHA on success
  }).index("by_timestamp", ["timestamp"]),
});
