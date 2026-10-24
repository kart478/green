// init-settings.mjs  — run with: node init-settings.mjs
// Initializes settings in the Convex production database.

import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexHttpClient("https://rapid-chameleon-526.convex.cloud");

const result = await client.mutation(api.settings.initSettings, {
  repoOwner: "HanzoHas",
  repoName: "commmit",
  branch: "main",
  filename: "dummy.txt",
  authorName: "HanzoHas",
  authorEmail: "micaharthur947@gmail.com",
  commitMessage: "Update file",
  probability: 1,
  cronSchedule: "0 12 * * *",
});

console.log("✅ Settings initialized! ID:", result);
