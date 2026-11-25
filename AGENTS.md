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

## This repository is public

Everything here is published: files, commits with their author and message, issues and comments, and CI logs. Whetstone runs on a person's own data, and that data stays on their machines. Nothing from a real installation ever enters the repository.

- **What may enter:** code, documentation, seed content generated for the project, and examples invented for the purpose.
- **What never enters:** a database or any export of one; journal entries, transcripts, notes, answers, recaps, prompts and model replies about them, quoted or paraphrased, even as an example; names, email addresses, hostnames, tailnet names and addresses, home paths, account ids, employers and clients; ids or links from private records and repositories; `.env`, keys, tokens, passphrase hashes and backups. Deployment settings live in `.env` and `docker-compose.override.yml`, which Git ignores.
- **Tests and fixtures use invented data only.** Never copy rows from a real database into a test, even with the names changed.
- **Commits use a GitHub no-reply address** as author and committer.
- **The guard.** `npm install` points `core.hooksPath` at `.githooks`, whose hooks run [`cli/guard/public-guard.mjs`](cli/guard/public-guard.mjs) on every staged file, commit message and push. It applies public rules (secrets, personal details, data files) and two private checks configured outside the repository: patterns that name the owner's private identifiers, and fingerprints of their own text, built by [`cli/guard/private-fingerprints.mjs`](cli/guard/private-fingerprints.mjs). Binary files need an entry in the allow list, because they cannot be read. Once the hooks are on, a machine without that configuration cannot commit or push. They are on only after `npm install` (not with `--ignore-scripts`), so in a fresh clone run `npm install` before the first commit, and check that `git config core.hooksPath` says `.githooks`. On GitHub, push protection refuses known secret formats. CI then runs the public rules on every file and commit in the history, plus gitleaks, but it runs after the push, so it can only detect a leak, not prevent it. Edits made on github.com skip the hooks: do not make them.
- **Never bypass the guard**: no `--no-verify`, no other hooks path, no weakened rule to get a commit through. A false alarm on a public rule goes in `.public-guard-allow` with a reason in the commit; a private finding means the text must change.
- **Issues and comments follow the same rules.** Write them as if they were commits.
- **If something private is pushed,** stop and tell the owner. Rewriting history does not unpublish it: GitHub keeps a commit readable by its id until GitHub Support removes it, and any exposed secret must be rotated.

## Rules that are easy to break

- **The answer never reaches the browser early.** Retrieval drills send the target only on reveal or after a correct answer, and the effort window is enforced on the server.
- **Rubrics are immutable once used.** Edit `rubrics/<id>.v<n>.yaml` by copying it to the next version; the app refuses a used version whose file changed.
- **Every model call goes through `judge()` or `check()`** in `src/lib/server/judge/run.ts`, and is listed in `LLM_FEATURES` in `src/lib/server/settings.ts` with what it sends, so Settings can show it and switch it off.
- **Deterministic scoring lives in `src/lib/core/`** with tests in `tests/`. Item selection follows `src/lib/core/rotation.ts`: nothing seen comes back while unseen items remain.
- **Seed ids are permanent.** Never rerun `seed/scripts/a1_build.py` against a live database: it renumbers ids. Edit the JSON in place.
- **Portuguese means European Portuguese** in items, hints and prompts. Guidance texts make no clinical claims.
- **Never test against a real database.** Copy it first with `better-sqlite3`'s `backup()` and point `WS_DB_PATH` at the copy.
- **Nothing personal enters the repository.** See [This repository is public](#this-repository-is-public).

## Commands

```bash
npm test                      # unit tests
npm run check                 # svelte-check, must report 0 errors
npm run guard                 # the public guard over every tracked file and commit
npm run build                 # production bundle
docker compose up -d --build  # deploy; the container seeds on start
```
