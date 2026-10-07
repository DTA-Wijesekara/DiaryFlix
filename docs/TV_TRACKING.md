# TV seasons and episodes

Film logging remains a single dated diary entry. For a TV series, choose **General series entry** or **A specific episode** in the logging form. General entries preserve old series history without guessing which episodes were watched.

Episode entries store season/episode identity and the duration known when saved. Season 0 holds specials. Use TMDB season lookup or enter episode details manually; unknown durations contribute no estimated time. The episode lookup follows the [TMDB season details API](https://developer.themoviedb.org/reference/tv-season-details).

Open a series from the diary to browse seasons, log its next known released episode, set Watching / On hold / Dropped / Completed, or log unwatched episodes in a season on an explicit date. Bulk logging supports up to 100 episodes per operation, skips existing watches, and rejects episodes without a release date or released after the watch date. A failed batch rolls back completely. Use individual logging for rewatches and episodes with unknown air dates.

Progress counts distinct released regular episodes. Rewatches and specials do not inflate it. “Caught up” requires a complete imported catalog; “Finished” additionally requires an ended series with every regular episode released and watched. The personal Completed status is independent. Catalog refresh is manual, preserves watched history, and uses a ten-minute browser cache. New or incomplete catalogs are labelled accordingly.

The diary and title library include All / Films / TV filters. CSV exports include episode identity and watched minutes. Film rewatch totals exclude episode entries. Recommendation ratings give each viewer one averaged contribution per title.

**Deployment prerequisite:** migration 6 must run before starting the updated API. Back up the target database, pause writes, and run `npm run db:migrate` from `server`, then restart the API. The migration adds TV tables and duration snapshots; it leaves old series entries at series level. Do not run tests against Neon: use a separate local database ending in `_test` via `TEST_DATABASE_URL` and `npm run test:integration`. See [OPERATIONS.md](OPERATIONS.md) for the deployment procedure.

