# Whetstone

A self-hosted, single-user app that trains the cognitive side of communication: finding the word you know, turning words you have read into words you use, remembering where a conversation or a work session stands, in English and European Portuguese.

Scores are computed in code wherever possible. Where judgment is needed, an optional AI judge grades against versioned rubrics and keeps enough to audit the result. Whetstone is a personal training tool. It makes no clinical claims.

## What it does

- **Word games:** Definition to word, Word Rush, Synonym ladder and Translate it, with an effort window before any hint and a ladder of sound hints.
- **Vocabulary:** capture words and tip-of-the-tongue moments, then practise them with FSRS spaced repetition.
- **Conversation recall:** write a recap, confirm its key points, and recall them later.
- **Work sessions:** leave a short resume note, then recall it before you see it when you return.
- **Progress:** per-skill Glicko-2 ratings, a daily plan, a repeatable benchmark, full history, and JSON, CSV and database export.
- **Optional journal:** write in a folder of Markdown files and ask for reports and wording help.

The [usage guide](docs/usage.md) covers each activity, the [design](docs/design.md) explains the architecture and evidence, and [scoring](docs/scoring.md) gives every formula.

## Privacy

Whetstone keeps its data in one SQLite file on your machine, and **no AI provider is enabled by default**. With `WS_LLM_PROVIDER=none`, nothing is sent to a model. Activities that need a judge tell you when one is unavailable. A Word Rush round that cannot be checked is kept as practice and never affects a score, rating or benchmark.

If you choose a provider, every feature switched on in Settings can send your text to it. All are on by default, including conversation recaps, work notes and, if you configure them, journal entries and Claude Code session titles, project paths and transcript tails. Each feature has its own switch, and Settings says what it sends. Transcript and note text is not redacted, so avoid names and confidential material unless your provider's terms suit it.

The app has one passphrase and is meant for one person. Docker binds it to `127.0.0.1`. Put it behind HTTPS and your own network controls before reaching it from another device. The app does not throttle login attempts, so add rate limiting at your proxy if the login page is reachable beyond a trusted network.

## Run it with Docker

```bash
cp .env.example .env
mkdir -p data
docker compose build
docker compose run --rm --no-deps whetstone node cli/hash-passphrase.mjs
```

It asks for your passphrase without showing it. Paste the printed hash into `.env`, in single quotes, and set `WS_API_TOKEN` to the output of `openssl rand -hex 24`. Then:

```bash
docker compose up -d
```

Open `http://127.0.0.1:3000`, or the port you set in `WS_PORT`. If your user id is not 1000, set `WS_UID` and `WS_GID` in `.env`. If you reach the app through another URL, set `WS_ORIGIN` to it, or logins and forms will be rejected.

## Develop

Node 24 or newer is required. The lexicon step needs [uv](https://docs.astral.sh/uv/).

```bash
npm install
cp .env.example .env
npm run lexicon
npm run seed
npm run dev
npm test
npm run check
```

Without the lexicon the app still runs, but frequency-based features have less data and letter rounds of Word Rush are practice only.

## Environment

| Variable | What it is |
|---|---|
| `WS_PASSPHRASE_HASH` | Argon2 hash of the login passphrase, in single quotes |
| `WS_API_TOKEN` | Bearer token for the `ww` command and hooks |
| `WS_LLM_PROVIDER` | `none` (default), `anthropic`, `deepseek` or `ollama` |
| `WS_ANTHROPIC_API_KEY`, `WS_ANTHROPIC_WORKSPACE_ID` | Anthropic key, and the workspace id if the key requires one |
| `WS_DEEPSEEK_API_KEY`, `WS_DEEPSEEK_BASE_URL` | DeepSeek key and base URL |
| `WS_OLLAMA_BASE_URL` | Ollama's OpenAI-compatible URL |
| `WS_MODEL_FAST`, `WS_MODEL_JUDGE` | Model ids for quick checks and rubric grading. Set them for any provider other than DeepSeek |
| `WS_PRICE_FAST`, `WS_PRICE_JUDGE` | USD per million tokens, `in/out`, for the cost log |
| `WS_DATA_DIR` | Database folder |
| `WS_PORT`, `WS_ORIGIN`, `TZ`, `WS_UID`, `WS_GID` | Docker: local port, public URL, time zone and data owner |
| `WS_DISPLAY_NAME` | Optional name for the home screen greeting |
| `WS_LEARNER_PROFILE` | Optional description of the writer, used by the journal coach |
| `WS_ALLOWED_HOSTS` | Comma-separated extra hostnames for the development server |
| `WS_CLAUDE_PROJECTS_DIR` | Optional Claude Code transcripts folder |
| `WS_JOURNAL_DIR`, `WS_JOURNAL_LINK_PREFIX` | Optional journal folder, and its path inside an Obsidian vault |

## Optional integrations

Copy `docker-compose.override.example.yml` to `docker-compose.override.yml`, keep only what you want, and mount only those folders.

- **Claude Code sessions.** With `WS_CLAUDE_PROJECTS_DIR` set, Whetstone reads your local transcripts to list work sessions. If a model provider is on, a resume drill with no saved note can send a bounded tail of the conversation to it. Turn that off in Settings if you do not want it.
- **Journal.** `WS_JOURNAL_DIR` points at a folder holding `Journal/<yyyy>/<yy.mm>/<yyyy-mm-dd>.md`, optionally `Journal/Voice Journals/`, and a `Whetstone/` folder for reports. Whetstone edits entries in place and refuses to overwrite a file changed elsewhere. Reports and wording help send text to the provider only when you ask.

## The `ww` command

Run `node cli/ww.mjs`, or link it onto your `PATH`. It reads `WS_URL` and `WS_API_TOKEN` from the environment or `~/.config/whetstone/cli.env`.

```bash
ww note "what I finished and its state" "the next concrete action" --risks "…" --waiting "…"
ww resume            # the resume-drill link for the session in this directory
ww resume off        # turn resume drills off (on to turn them back on)
ww tot "the word for a feeling of dread before a deadline" --pt
ww word escamotear "O relatório escamoteia os custos." --pt
ww sessions
```

## Backup and restore

Settings has "Download a database backup" and "Export everything as JSON". To restore, run `docker compose down`, copy the backup over `data/whetstone.db`, delete any `whetstone.db-wal` and `whetstone.db-shm` beside it, and run `docker compose up -d`.

## Adding an exercise or a rubric

1. **Scoring.** Put the deterministic part in `src/lib/core/` with tests in `tests/`, and document the formula in `docs/scoring.md`.
2. **Server logic.** One module in `src/lib/server/exercises/` that starts an attempt, scores it, calls `rate()` for the skill it trains, and calls `finishAttempt()`.
3. **Rubric.** A file `rubrics/<id>.v<version>.yaml` shaped like the A4 one. A rubric is immutable once used: the app refuses to grade with a used version whose file changed. Edit by copying to the next version.
4. **Guidance and metadata.** A "why this works" entry in `src/lib/content/guidance.ts` (no clinical claims), and its name, skill and icon in `src/lib/content/exercises.ts`. Classify standalone games with `kind: 'game'` and everything else with `kind: 'activity'`.
5. **Model calls.** Any new call gets an entry in `LLM_FEATURES` in `src/lib/server/settings.ts`, so it shows in Settings with a switch.
6. **Selection.** Use `chooseItem()` in `src/lib/server/services.ts`, so the no-repeat rule applies, and give the exercise a cooldown in its `COOLDOWN_DAYS`.

## License

The code is under the [MIT License](LICENSE). Word-frequency data and the seed files that carry it have separate terms and credits, listed in [NOTICE.md](NOTICE.md).
