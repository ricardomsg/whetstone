# Scoring and selection

Every formula that turns an attempt into a 0–100 skill score, and the rule that picks the next item. The code is `src/lib/core/scoring.ts`, `srs.ts`, `glicko2.ts` and `fluency.ts`, with tests in `tests/core.test.ts`. Change a formula only together with this page, because trends compare across the change.

## Per exercise

| Exercise | Skill | Score |
|---|---|---|
| A1 definition → word | WR | 100 unaided; minus 15 per hint (a setting); minus 10 for a near miss (same stem, other form); 0 after a reveal. An accepted synonym scores like the target. Tip-of-the-tongue and "don't know" are recorded as flags and never change the score |
| A1 with chosen languages | WR | Each answer language is a separate A1 attempt on that language's card, scored with the A1 formula and rated in that language. The definition may come from the matching card in the other language |
| A8 translate it | WR | A1's formula without the near-miss deduction: 100 unaided, minus 15 per hint, 0 after a reveal. Answers are compared without a leading article or "to", and an inflected form the sentence needs ("adiaram" for "adiar") counts as the answer. An alternative the checker judges equally good scores like the target. A false friend, the cue typed back, or a wrong answer costs nothing by itself but is recorded. Time to the answer is recorded and shown, never scored. The rating is the WR rating of the answer's language |
| A2 fluency sprint | FL | Until three earlier checked sprints of the same kind and language exist, 25 valid words = 100. Afterwards the personal baseline (the last 10 checked sprints of the same kind and language) mean scores 50 and each standard deviation, floored at 2 words, moves it 20 points. A round that cannot be fully checked earns no score and stays out of ratings, baselines and benchmarks |
| A4 synonym ladder | PR | Rubric weighted mean, then minus 5 per duplicate alternative or alternative equal to the flat word |
| B2 productive review | VOC | Produced unaided 100; minus 15 per hint; 0 when revealed or not produced |
| B3 use it | VOC | Rubric weighted mean. A correct use, which counts toward graduation, needs meaning ≥ 4, collocation ≥ 3 and naturalness ≥ 3 |
| C1 recap | — | Capture and reference editing, not a scored drill |
| C2 delayed recall | TRP | Rubric weighted mean: 60% coverage and 40% correctness against the confirmed key points |
| C3 re-entry | TRP | 80% rubric mean (70% accuracy, 30% opener usefulness), plus 20% speed: `clamp(100 × (60000 − elapsedMs) / 50000, 0, 100)`, rounded. Full speed credit through 10 seconds; zero from 60 seconds. Elapsed time runs from the first server-issued cue to submission and excludes grading latency |
| D1 resume note | TRA | Rubric weighted mean |
| D2 resume drill | TRA | 40% retrospective and 60% prospective coverage, each `(score − 1) / 4 × 100` |

A rubric weighted mean is `100 × Σ wᵢ (sᵢ − 1) / 4 / Σ wᵢ`, rounded, over criteria scored 1 to 5.

## Review grades (FSRS)

| Outcome | Grade |
|---|---|
| Revealed, not produced, or three or more hints | Again |
| One or two hints, or produced after more than 15 s | Hard |
| Produced unaided in under 5 s | Easy |
| Produced unaided otherwise | Good |

The grade is shown with its reason and can be overridden; both are logged. Scheduling is FSRS through `ts-fsrs` with 90% target retention. A card reviewed today is not due again before tomorrow, even when its FSRS learning step falls minutes later (2026-11-04): the step is kept in the card's state and the card is served from the next local day.

## Conversation recall scheduling

The first C2 recall is due 24 hours after key points are confirmed. Thereafter, FSRS uses the same 90% target retention as vocabulary review, with the C2 score mapped to Again below 50, Hard from 50 to below 75, Good from 75 to below 90, and Easy from 90. Each conversation keeps its own FSRS state; the attempt records the grade, state before/after, review log and next due time. Editing reference points or restoring an archived thread resets scheduling after confirmation. Changing only the label, topic or cue preserves the existing due time.

Only a successfully graded C2 attempt against the current active thread version advances its schedule. C3 does not affect it. Unavailable or disabled model grading saves the recall and reveals the reference without inventing a score, changing ratings or advancing the schedule. Repeated submission cannot grade or advance twice. Score disputes change the displayed score, not an already-applied schedule or rating; C3 criterion disputes retain the original measured speed component. C2/C3 update TRP ratings per language, with no item opponent rating.

The Progress scatter plot uses graded C2 attempts only: the displayed recall score against elapsed days between original recap capture and the start of that recall. It is a descriptive view of different conversations, not a controlled forgetting curve. Implemented in `src/lib/core/threads.ts` and `src/lib/server/exercises/threads.ts`, with regression tests in `tests/threads.test.ts`.

## Ratings and difficulty

Each attempt is one Glicko-2 game between the skill rating (per language, or `all` for resumption) and the item's rating, with the normalised score as the result. Both update, so items calibrate themselves. Item selection picks among the five items whose expected success is closest to 75%. A new item starts at `1500 + 150 × (band − 2)`, plus 30 for verbs and 50 for abstract words, where band 1 is the most frequent. An A8 item starts at `1500 + 150 × (difficulty − 2)`, with difficulty 1 to 3 from generation; a word you saved as missing starts at 1500. Benchmark attempts change no rating.

## Fluency clusters

Semantic clusters are consecutive valid words sharing a subcategory label from the validation call; letter clusters are consecutive words sharing their first two letters or their last three (an approximation of phonemic clusters). Cluster size counts from the second word (Troyer et al., 1997); switches are transitions between clusters, single words included.

## Which item comes next

The rule: an item you have seen does not come back until you have been through the rest of the roster. The code is `src/lib/core/rotation.ts`, tested in `tests/rotation.test.ts`.

1. **Unseen first.** Any item never shown in practice is chosen before any repeat. Shown means an attempt was started, finished or not; a fluency prompt skipped before the sprint starts is released back into the roster.
2. **Then the oldest.** Once every item has been shown, the next one comes from the quarter seen longest ago (at least five items), never inside the cooldown unless nothing else is left.
3. **Among the allowed items,** the one closest to 75% expected success is chosen, sampling among the five closest.
4. **Chosen languages.** A round with chosen languages draws from the definition language's cards that have a match. A card counts as shown when its definition was shown, whatever the answer language.
5. **Personal items** from the tip-of-the-tongue log and the word inbox get a 30% preference when they are eligible. In A8, the words you saved as missing in Portuguese get the same preference.

| Drill | Cooldown after the roster is used up |
|---|---|
| A1 definition → word | 14 days |
| A2 fluency sprint | 7 days |
| A4 synonym ladder | 14 days |
| A8 translate it | 14 days |

Review cards (B2) are not rotated: FSRS schedules them, and bringing a word back is the point. Benchmark items come from reserved sets that practice never uses.
