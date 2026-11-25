# Whetstone — how to use it, and what it does not do yet

Open your Whetstone URL on a computer or phone. Over HTTPS on Android, "Add to home screen" installs it, and it then appears in the share menu.

## A day with it

1. **Check-in.** The home screen nudges once a day. Six answers, all optional.
2. **Today's session.** The home screen shows a plan for 15 minutes: due reviews, drills aimed at your weakest areas, and one rotation drill. Each step says why it was chosen. Change the length or language on the Today page. The review step takes every due card in either language, whatever language the session is set to, and it counts as finished once no card is left due or the daily review cap is reached, even if that is fewer than it first asked for.
3. **Capture as life happens.**
   - **A word on the tip of your tongue:** the "Tip of tongue" button, or `ww tot "the meaning"`. Only the meaning is required. If you have not found it yet, the app offers sound hints before any suggestion.
   - **A new word while reading:** share the text to Whetstone from any Android app, or use "Word". Check the enrichment and confirm; it becomes a review card.
   - **Leaving a Claude Code session:** `ww note` in that session's directory, or "Resume note" on the Sessions page.
4. **Coming back to a session.** `ww resume` prints the link, or open it from Sessions. You recall first, then see the note. Press "Back in flow" once you are working again. `ww resume off` or the switch on the Sessions page turns the drill off; the note is then shown straight away.
5. **Benchmark.** Take the first one in week one, then every four weeks. About 15 minutes, one language at a time.
6. **At night, the journal, if you enabled it.** The Journal tab opens tonight's entry; see [Journal](#journal).

## Journal

This optional feature needs `WS_JOURNAL_DIR`. The Journal tab is where you write. Every entry is a Markdown file in your journal folder; Whetstone keeps no copy. How it is built is in the [design](design.md#the-journal).

- **Writing.** The tab opens tonight's entry; until 05:00 that is still the previous day's. It saves a second and a half after you stop typing, and when you leave the page. The arrows step to the previous and next entry; Entries lists them all by month, with voice journals marked and read-only.
- **If the entry changed elsewhere** (Obsidian, another device) while you were writing, nothing is overwritten: you choose to keep what is in Whetstone or load the other version.
- **Other words.** Select a word or a sentence and press Other words: alternatives that fit the sentence, each with its nuance, or rewordings with a different structure. Add what you are trying to say if the selection is not enough. Tap one to put it in the entry. **Find a word** takes only a description, for the word on the tip of your tongue, and inserts at the cursor. Learn sends a single word to the word inbox. Every request is logged in `Whetstone/Wording/<month>.md` in the journal folder.
- **Report.** Press Report and say in your own words which entries to read and what you want looked at or where you need help: "all my October entries, I keep using the same connectors", "my voice journals from last week", "my last five entries". Whetstone works out the entries from what you wrote; if you would rather pick them, open Pick entries yourself, and a pick wins over the request. One report reads up to about 300k characters, roughly a month of written and voice entries. It takes up to a minute. It answers your note first, then names where the writing or speech is weakest with your own sentences rewritten, words to try instead of the ones you used, sentence shapes you do not use, spelling, and short exercises built on your entries. The numbers at the end are counted by code. The report is a file in `Whetstone/Reports/`, and its words can be sent to the inbox from the report page.
- **What is sent.** Working out the entries sends only your request, today's date and the first and last day of the journal. A report sends the chosen entries (only the raw transcript of a voice journal) and your request; wording help sends the selection, its sentence and your description. Each has a switch in Settings → model features, and nothing of the reply is kept in the database.

## What is in Phase 1

| Area | Built |
|---|---|
| Word retrieval | A1 definition → word with the 15-second effort window, the sound-hint ladder, explicit give-up, a sentence after any hint or reveal; A2 fluency sprints (typed); A4 synonym ladder; A7 tip-of-the-tongue log |
| Vocabulary | B1 inbox with enrichment and the Android share target; B2 productive review on FSRS with the grade mapping shown and overridable; B3 use-it with graduation to active |
| Work sessions | D1 notes from the web, the CLI or an HTTP endpoint; D2 resume drill with the on/off switch; the list of Claude Code sessions read from the transcripts |
| Scoring | Objective metrics in code, a rubric judge with stored model, rubric version, prompt hash and raw reply, per-criterion disputes |
| Adapting | Glicko-2 per skill and language, items aimed at 75% success, a weakness list, the daily plan with reasons |
| Tracking | Progress page, benchmark battery v1, model usage and cost, JSON export and database download. Schedule your own backups; see Backup and restore in the README |

## Added 2026-09-25

- **History.** Every attempt is listed on the History tab, by day, filterable by drill and language, with what you were given, what you answered, the score and the judge's reasons. The roster bars show how much of each drill's items you have seen.
- **No repeats until the roster is used up.** Definition, fluency and synonym items you have seen do not come back while unseen ones remain; then the ones seen longest ago return first, never within 14 days (7 for fluency prompts) unless nothing else is left. Review cards keep their own spaced schedule. A fluency prompt you skip before starting goes back into the roster.
- **Alternatives to learn from.** After each synonym ladder, a list of good and tempting-but-wrong alternatives with the nuance of each, and the best one for the sentence. Generated once per sentence and kept; past attempts have a button for it.
- **A new look.** Bottom tab bar on the phone, a home screen built around today's session, and drill screens with a visible hint ladder, a score ring and clearer results.

## Added 2026-09-26

- **Daily progress in both languages.** A review step set to Both counts completed English and Portuguese reviews together. Single-language steps still count only that language; unfinished attempts do not count.
- **Resume-note shortcut.** On desktop, Alt+Shift+N (Option+Shift+N on Mac) opens a note for the most recently active work session, using the Sessions list's filter and skipping archived sessions. It does nothing while typing in a field. With no work sessions, it opens the new-session form. Sessions also lists the shortcut and has a direct link.
- **CSV export.** Settings offers a ZIP containing one UTF-8 CSV per table included in the JSON export, including attempts, reviews, tip-of-the-tongue captures, vocabulary, check-ins and notes. Empty tables retain their headers; structured fields remain JSON text. Spreadsheet formula-like text is prefixed with an apostrophe; JSON and the database download retain the original text.
- **Score disputes.** Progress shows disputed / judged attempts by drill and criterion over the selected 7, 28 or 90 days. Only finished attempts with a successful rubric evaluation enter the denominator; each attempt counts once despite judge retries or repeated overrides. A criterion's denominator includes only attempts graded on that criterion. Whole-score overrides count for the drill, not for individual criteria.
- **Recall answers stay on the server.** Session lists send note age and quality score only. Opening a resume drill or writing a note sends no saved note text; a drill receives its answer after recall is submitted. Explicitly opening Notes still shows saved notes, as does resuming with drills switched off. Switching sessions or modes resets the form and recall result.
- **Transcript summaries enabled.** When a model provider and Claude Code transcripts are configured, a resume drill without a saved note can use a summary, written by that provider, of its Claude Code transcript tail. The default is the last 12 conversational turns, text only with no tool output, capped at 12,000 characters. Settings can change the turn count or switch this feature off. When no note or usable summary is available, the recall is saved as a note. Use initials when writing notes; transcript names are not automatically redacted.

## Conversation recall — C1, C2 and C3

**Added 2026-09-26:** the first Phase 2 drills, with typed input. Home → Recap captures a conversation; Train → Conversations opens the list, and Home shows a reminder when delayed recalls are due.

1. **Recap (C1).** Enter a person/group label or initials, the topic, and a short recap. The two-minute timer is a pacing aid, not a cutoff that discards your writing. The recap is saved before extraction calls the provider. Suggested atomic facts, decisions and open items are a draft: edit, add or remove points and check the vague re-entry cue, then confirm. If extraction is off or unavailable, enter the points manually. Capture retries reuse the same record.
2. **Delayed recall (C2).** Confirming a new thread, or changing its key points, makes it due the next day. When due, start from only the person and topic cue and recall the state, decisions and open items. Submit to reveal the confirmed reference and the judge's coverage/correctness feedback, including omissions. A successful grade schedules the next review with FSRS; the schedule and grade are logged with the attempt. A missing grade or an edited/archived reference does not advance scheduling.
3. **Re-entry (C3).** Start to see the vague cue and start the timer. Write a restating opener and the current state. The score combines accuracy, usefulness of the opener and time measured by the server. This optional practice does not change the delayed-recall schedule.

Every drill stores the reference points as they were at its start. Later edits do not rewrite old results. Unfinished page and History responses omit the reference and model evaluations. Repeated submission returns the saved result; it does not grade or schedule twice. Viewing a recap or exporting your data remains an explicit way to read saved content.

The three model features have separate switches in Settings. Completed captures and drills appear in History; Progress plots delayed-recall score against time since capture, with individual points linked to their attempts. JSON/CSV exports and database backups include threads, key points and reference snapshots. Archive hides a thread from practice without deleting its history; restoring it returns it to review before scheduling resumes. [Scoring and scheduling formulas](scoring.md#conversation-recall-scheduling) are documented alongside the existing drills.

## Added 2026-10-04

- **"Why this works" on demand.** Each exercise's explanation opens by itself only the first two times that exercise is shown, so it is there when you are about to try it. After that it stays hidden behind the ⓘ button in the drill's header (or a "Why this works" link on pages without one); the × closes it. It never shows during a running fluency sprint or inside a benchmark.

## Translate it — A8

**Paused since 2026-11-24.** Natural answers were often judged only close, and some seed targets are not what a speaker in Portugal would say: "vigiar" for keeping an eye on a bag, where "tomar conta" is usual. Until every item is re-checked, Translate it is not in Today's session or on the Games list, it cannot be started, and its cards wait in Review with their schedule kept. Missing in Portuguese still saves the word, for when it is back. The switch is `PAUSED` in `src/lib/content/paused.ts`.

Added 2026-10-09 for a common bilingual problem: the English word arrives first and the Portuguese one does not come. Train → Games → **Translate it**, with two entries: **English → Português** (the main one) and **Português → English**.

1. **A round** is eight items. Each shows a word or short expression in a sentence, in one language; type its equivalent in the other. Say it out loud first, then type it. Since 2026-11-04 English → Português no longer asks its 14 idioms, which were unnatural in Portugal or wrongly translated; a retired item is not asked in the game or in Review. Its everyday phrases, such as "carta de condução", stay.
2. **Answers** count without a leading article or "to", in the dictionary form or the form the sentence needs, with accents and one typo forgiven as in Definition → word. A different but equally good translation is accepted after a model check. Brazilian forms and anglicisms are named as such and do not count. Typing the false friend (for example "atualmente" for "actually") or the English word back is recorded and you try again.
3. **Hints** unlock after the effort window. The first is the Portuguese sentence with a gap, which puts you back in Portuguese; then the shape (words, letters and, when checked, syllables), the first sound, and the ending. After a hint or a reveal, write a short sentence of your own with the answer.
4. **Afterwards** you see the answer, other accepted renderings, the false friend if there is one, and a short note. A hint, a reveal, a tip-of-the-tongue mark or a false friend puts the item in Review, where it comes back spaced out, but only when the answer is one word. Review wants the exact answer, so expressions of several words stay in the game, where the model judges the meaning (since 2026-11-04).
5. **Missing in Portuguese.** When only the English word comes in real life, save it from Home, from Train → Your vocabulary, or with `ww pt "deadline" "what you were saying"`. The app prepares the Portuguese answer without showing it and opens a one-item round at once. The item is preferred in later rounds, and goes into Review too when its answer is one word.

The daily plan includes a few English → Portuguese items every day. Progress lists A8 weaknesses by category, such as false friends or phrasal verbs. Scores follow [the A8 row](scoring.md#per-exercise).

The seed has 328 English → Portuguese items in eleven categories (conversation, feelings, work, tech, life admin, household, tools, body and health, phrasal verbs, collocations and idioms, false friends) and 168 Portuguese → English items. They were generated and checked by a blind translator as described in the [seed README](../seed/README.md#a8-items).

## Definition → word in chosen languages

Added 2026-10-09. Train → Definition → word → **Choose languages** opens a setup screen. The English and Português links still play the usual single-language round.

1. **Read the definition in** English or Português.
2. **Find the word in** English, Português, or both. With both selected, you answer in the order you tapped them; the numbers on the buttons show it. After the first answer, "Now in …" asks for the same meaning in the next language, with the first word shown above the definition.
3. Each answer is its own Definition → word attempt in its language, with the effort window, hints in that language, the sentence step after a hint, and its own score and rating. It appears in History like any other attempt.
4. The setup screen remembers the last choice on that device.

**Matching cards.** 475 matched pairs cover 238 of the 260 English practice cards and 245 of the 260 Portuguese ones, so any combination works on them. The 37 left unmatched failed three attempts to find a word whose definition points only to it, such as "hair" or "alentejano"; they stay in single-language rounds. When the matching word was already a card in the other language, the two were linked; otherwise a new card was generated and validated like the originals ([seed README](../seed/README.md#a1-matching-cards)). Cards you save yourself from the tip-of-the-tongue log or the inbox have no match yet, so they appear only in single-language rounds, as do benchmark cards.

## Known limitations

- **The judge is not calibrated yet.** Rubric scores come from the configured grading model with reasoning. Nothing yet checks it against your own ratings or a fixed anchor set; that is Phase 2. Dispute any score that looks wrong; disputes are logged.
- **Portuguese items and hints are generated.** They were validated by a blind solver, but European Portuguese hints (syllables, stress) were not checked by a native speaker. Report bad items and they can be deactivated.
- **No voice.** Speaking drills and transcription are Phase 2.
- **Correlations with the check-in** are planned. Today the app stores check-ins and counts the days, but computes no correlations.
- **Letter-fluency clusters are approximate:** words sharing the first two letters or the last three.
- **Journal exercises are not drills yet.** A report's exercises are written for you to do on paper or aloud; nothing scores them, and its words reach practice only through the word inbox.
- **Offline use:** the app shell is cached, but capture and scoring need the server.

## Games and follow-up practice

Added 2026-10-04. Train lists the standalone games: **Definition → word**, **Word Rush**, formerly Fluency sprint, **Synonym ladder**, and, since 2026-10-09, **Translate it**. Each has a distinct colour, illustration and pitch on its card and drill header. The home page still centres on today's training plan.

Other activities appear under Tools & practice, grouped into Your vocabulary, Your conversations, Your work sessions, and Assessments & progress. Their descriptions explain what to save first. Benchmark is a periodic assessment.

**Review** is scheduled vocabulary practice. It asks you to produce a word from its meaning or a sentence with a gap. Cards come from confirmed inbox words, resolved tip-of-the-tongue entries, and completed Definition → word rounds where you marked tip-of-the-tongue, used a hint or revealed the answer. A wrong guess alone does not create a card. Reviews return when due according to the existing spaced schedule, and a card answered today does not come back before tomorrow, even if you got it wrong.

**Use it** is sentence practice for words you confirmed in the inbox. Confirming a word moves it into learning and makes it available to this activity. This is separate from the sentence step inside Definition → word, which follows a hinted answer or reveal. That step completes the game attempt; it does not add the word to Use it. Successful uses on separate days advance an inbox word toward active vocabulary.

**Delayed recall** and **Re-entry drill** belong to saved conversations. A confirmed recap feeds them; the first delayed recall is due the next day. Re-entry asks for an opener to restart that conversation within 60 seconds. Their full flow is documented under [conversation recall](#conversation-recall--c1-c2-and-c3).

**Resume drill** belongs to Work sessions. Select Resume for a session to recall where you stopped and what comes next before the saved note is shown. With resume drills off, Resume opens the note directly. A usable transcript summary can supply the reference when no note exists, as described [above](#added-2026-09-26).

## Daily tool prompts

Added 2026-10-05. Home keeps two prompts below today's training plan:

- **Before a work break: Resume note.** Choose a work session, tap Note, and save where you stopped and the next concrete action. When you return, open the session and choose Notes to read it directly. The Home link asks you to choose the session rather than assuming which task you mean. If there is no session for the task, create one from the Sessions page.
- **When a word won't come: Tip-of-the-tongue log.** Capture the meaning you were reaching for. The word can remain unresolved; the log lets you return to it later.

Both prompts stay visible across visits and after use. The Other tools row holds New word, Recap and Check-in. Bookmark the intended session's note page and the missing-word capture page for access while working elsewhere. These are in-app cues, not scheduled notifications.
