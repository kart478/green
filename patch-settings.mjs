// patch-settings.mjs — run with: node patch-settings.mjs
// Adds missing createIssues and createPRs fields to existing settings row.
import { ConvexHttpClient } from "convex/browser";

const client = new ConvexHttpClient("https://rapid-chameleon-526.convex.cloud");

// Use inline query to find the settings doc ID
const settings = await client.query(
  { name: "settings:getSettings", args: {} },
);

if (!settings) {
  console.error("No settings found.");
  process.exit(1);
}

console.log("Found settings ID:", settings._id);

// Patch via updateSettings (which already accepts these optional fields)
await client.mutation(
  { name: "settings:updateSettings", args: { createIssues: true, createPRs: true } },
);

console.log("✅ Patched! createIssues=true, createPRs=true");
