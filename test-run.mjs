// test-run.mjs — run with: node test-run.mjs
// Triggers one manual green wave run on production and prints the result.

import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api.js";

const client = new ConvexHttpClient("https://rapid-chameleon-526.convex.cloud");

console.log("⏳ Triggering green wave run on production…");

try {
  const result = await client.action(api.greenWave.triggerManualRun, {});
  console.log("✅ Triggered:", result);

  // Wait a moment then check the latest log entry
  await new Promise(r => setTimeout(r, 4000));
  const history = await client.query(api.settings.getHistory, { limit: 1 });
  if (history.length > 0) {
    const last = history[0];
    const time = new Date(last.timestamp).toLocaleString();
    console.log(`\n📋 Latest log entry:`);
    console.log(`   Status:  ${last.status}`);
    console.log(`   Message: ${last.message}`);
    console.log(`   Time:    ${time}`);
  }
} catch (err) {
  console.error("❌ Error:", err.message);
}
