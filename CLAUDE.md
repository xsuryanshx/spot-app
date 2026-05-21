# Spot - Claude working agreement

## Testing policy
- Every new feature ships with a Vitest unit test for its pure logic in the same change.
- Test the TypeScript logic around the pipeline: parsing, math, recommendations, state, renderers, Strava.
- Do not write e2e tests against RocketRide or Spectrum for the hackathon path. Use fixtures.
- Run `npm test` before declaring a feature done.

## Architecture invariants
- Heavy AI logic lives in `pipelines/spot.pipe` through RocketRide.
- The Spectrum agent stays a thin iMessage/terminal I/O layer.
- Start the RocketRide pipeline once at agent boot with `useExisting: true`.
- Read `result_types` or normalize the configured response key instead of assuming a default result key.
- Do not block the Node event loop inside Spectrum message handlers.

## Demo safety
- Keep the text logging path working even if photo/voice handling is still in progress.
- Pre-cache demo foods and a canned activity before the final demo.
- Keep a recorded fallback video.
