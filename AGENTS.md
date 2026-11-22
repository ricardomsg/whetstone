# Whetstone: source instructions

Read [`README.md`](README.md) before changing anything.

## Where the truth is

| What | File |
|---|---|
| The design: architecture, data model, rubric format, evidence | [`docs/design.md`](docs/design.md) |
| Every scoring and selection formula | [`docs/scoring.md`](docs/scoring.md) |
| What is built, how to use it, its limits | [`docs/usage.md`](docs/usage.md) |
| Seed content and how it was generated | [`seed/README.md`](seed/README.md) |

A change to behaviour updates the page that states it in the same commit.

## Rules that are easy to break

- **The answer never reaches the browser early.** Retrieval drills send the target only on reveal or after a correct answer, and the effort window is enforced on the server.
- **Rubrics are immutable once used.** Edit `rubrics/<id>.v<n>.yaml` by copying it to the next version; the app refuses a used version whose file changed.
- **Every model call goes through `judge()` or `check()`** in `src/lib/server/judge/run.ts`, and is listed in `LLM_FEATURES` in `src/lib/server/settings.ts` with what it sends, so Settings can show it and switch it off.
- **Deterministic scoring lives in `src/lib/core/`** with tests in `tests/`. Item selection follows `src/lib/core/rotation.ts`: nothing seen comes back while unseen items remain.
- **Seed ids are permanent.** Never rerun `seed/scripts/a1_build.py` against a live database: it renumbers ids. Edit the JSON in place.
- **Portuguese means European Portuguese** in items, hints and prompts. Guidance texts make no clinical claims.
- **Never test against a real database.** Copy it first with `better-sqlite3`'s `backup()` and point `WS_DB_PATH` at the copy.
- **Keep personal data out of the repository.** Deployment settings belong in `.env` and `docker-compose.override.yml`, which Git ignores.

## Commands

```bash
npm test                      # unit tests
npm run check                 # svelte-check, must report 0 errors
npm run build                 # production bundle
docker compose up -d --build  # deploy; the container seeds on start
```
