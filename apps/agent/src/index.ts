import "./env.js";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { terminal } from "spectrum-ts/providers/terminal";
import { toPipelineTurn } from "./payload.js";
import { runPipeline } from "./pipeline.js";
import { renderMacroCard } from "./renderers.js";
import { startStravaCallbackServer } from "./strava-callback.js";
import { autoSyncStravaIfLinked, handleStravaCommand } from "./strava-handlers.js";

const providers = [];

if (process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET) {
  providers.push(imessage.config());
}

if (process.env.SPOT_ENABLE_TERMINAL === "1" || providers.length === 0) {
  providers.push(terminal.config());
}

const app =
  process.env.PHOTON_PROJECT_ID && process.env.PHOTON_PROJECT_SECRET
    ? await Spectrum({
        projectId: process.env.PHOTON_PROJECT_ID,
        projectSecret: process.env.PHOTON_PROJECT_SECRET,
        providers
      })
    : await Spectrum({ providers });

console.log(`Spot agent listening on ${providers.length} Spectrum provider(s).`);
startStravaCallbackServer();

for await (const [space, message] of app.messages) {
  if (process.env.PHOTON_ACCOUNT_ID && message.sender.id === process.env.PHOTON_ACCOUNT_ID) {
    continue;
  }

  await app.responding(space, async () => {
    const turn = toPipelineTurn(message, space);

    if (turn.kind === "text" && turn.text) {
      const stravaReply = await handleStravaCommand(turn.userId, turn.text);
      if (stravaReply) {
        await space.send(stravaReply.reply);
        return;
      }
    }

    const stravaNote = await autoSyncStravaIfLinked(turn.userId);
    const result = await runPipeline(turn, { stravaNote });
    await space.send(renderMacroCard(result));
  });
}
