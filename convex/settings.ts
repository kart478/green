import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get current settings. Returns null if not yet initialized.
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("settings").collect();
    return rows[0] ?? null;
  },
});

/**
 * Initialize settings with defaults on first run.
 * Call this once from the dashboard after deploying.
 */
export const initSettings = mutation({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    branch: v.optional(v.string()),
    filename: v.optional(v.string()),
    authorName: v.string(),
    authorEmail: v.string(),
    commitMessage: v.optional(v.string()),
    probability: v.optional(v.number()),
    cronSchedule: v.optional(v.string()),
    createIssues: v.optional(v.boolean()),
    createPRs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Only create if no settings exist yet
    const existing = await ctx.db.query("settings").collect();
    if (existing.length > 0) {
      return existing[0]._id;
    }
    return await ctx.db.insert("settings", {
      repoOwner: args.repoOwner,
      repoName: args.repoName,
      branch: args.branch ?? "main",
      filename: args.filename ?? "dummy.txt",
      authorName: args.authorName,
      authorEmail: args.authorEmail,
      commitMessage: args.commitMessage ?? "Update file",
      probability: args.probability ?? 1.0,
      scheduleEnabled: true,
      cronSchedule: args.cronSchedule ?? "0 12 * * *",
      createIssues: args.createIssues ?? true,
      createPRs: args.createPRs ?? true,
    });
  },
});

/**
 * Update one or more settings fields.
 */
export const updateSettings = mutation({
  args: {
    probability: v.optional(v.number()),
    scheduleEnabled: v.optional(v.boolean()),
    commitMessage: v.optional(v.string()),
    branch: v.optional(v.string()),
    filename: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorEmail: v.optional(v.string()),
    cronSchedule: v.optional(v.string()),
    createIssues: v.optional(v.boolean()),
    createPRs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("settings").collect();
    if (rows.length === 0) throw new Error("Settings not initialized yet.");
    const id = rows[0]._id;

    const patch: Record<string, unknown> = {};
    if (args.probability !== undefined)     patch.probability = args.probability;
    if (args.scheduleEnabled !== undefined) patch.scheduleEnabled = args.scheduleEnabled;
    if (args.commitMessage !== undefined)   patch.commitMessage = args.commitMessage;
    if (args.branch !== undefined)          patch.branch = args.branch;
    if (args.filename !== undefined)        patch.filename = args.filename;
    if (args.authorName !== undefined)      patch.authorName = args.authorName;
    if (args.authorEmail !== undefined)     patch.authorEmail = args.authorEmail;
    if (args.cronSchedule !== undefined)    patch.cronSchedule = args.cronSchedule;
    if (args.createIssues !== undefined)    patch.createIssues = args.createIssues;
    if (args.createPRs !== undefined)       patch.createPRs = args.createPRs;

    await ctx.db.patch(id, patch);
    return id;
  },
});

/**
 * Get the last N commit log entries, newest first.
 */
export const getHistory = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    const logs = await ctx.db
      .query("commitLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(limit);
    return logs;
  },
});
