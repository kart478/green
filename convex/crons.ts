import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Run the GitHub Green Wave action every day at noon UTC.
 *
 * To change the schedule, edit the cron expression here and redeploy:
 *   "0 12 * * *"  = noon UTC daily (default)
 *   "0 9 * * *"   = 9 AM UTC daily
 *   "0 0 * * *"   = midnight UTC daily
 *   "0 12 * * 1-5" = noon UTC, weekdays only
 *
 * After changing, run: npx convex deploy
 */
crons.daily(
  "github-green-wave",
  { hourUTC: 6, minuteUTC: 0 }, // noon UTC every day
  internal.greenWave.runGreenWave,
  { triggeredBy: "cron" }
);

export default crons;
