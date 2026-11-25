// Tests must never load live credentials, transcripts or the live database.
process.env.WS_ENV_LOADED = '1';
process.env.WS_DB_PATH = ':memory:';
process.env.WS_LLM_PROVIDER = 'none';
process.env.WS_CLAUDE_PROJECTS_DIR = '';
process.env.WS_JOURNAL_DIR = '';
// Dates in tests are written for Portugal's time zone, so they pass on any machine, CI included.
process.env.TZ = 'Europe/Lisbon';
