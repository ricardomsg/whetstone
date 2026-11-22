// "Why this works" and "how" for every exercise. Drill formats only; no clinical claims.
export const GUIDANCE: Record<string, { title: string; why: string; how: string }> = {
	A1: {
		title: 'Definition → word',
		why: 'A tip-of-the-tongue state means you reached the meaning but not the sound of the word. Words you find yourself tend to come back less often than words you are shown. So the answer stays hidden while you try, and the hints give you sounds, not meanings.',
		how: 'Type the word the definition describes. If it is on the tip of your tongue, say so. After the effort window you can take hints one at a time; revealing sooner needs an explicit give-up. After any hint or reveal, use the word in a sentence of your own. From Train, "Choose languages" lets you read the definition in one language and find the word in one or both.'
	},
	A2: {
		title: 'Word Rush',
		why: 'Producing many words against the clock exercises the search itself. Fluent speakers work through a cluster of related words, then switch to a new cluster when one runs dry; both are measured.',
		how: '60 seconds. Type one word and press Enter, as fast as you can. No names, no repeats. The score compares you with your own recent sprints, not with anyone else.'
	},
	A4: {
		title: 'Synonym ladder',
		why: 'Precision comes from choosing among options you can actually produce. Generating alternatives first and judging them second builds range and judgement together.',
		how: 'Write five words that could replace the flat word in this sentence. Pick the most precise one for this context and register, and say why in one line, ideally against the runner-up.'
	},
	A8: {
		title: 'Translate it',
		why: 'When you live in English, the English word often arrives first and the Portuguese one is slow. Producing the Portuguese yourself, before any help, practises exactly the step that fails when you speak. Words you once used come back faster than new ones are learned, so regular short rounds pay off quickly. Misses return later in Review, spaced out.',
		how: 'Read the English word or phrase in its sentence. Say the Portuguese out loud, then type it. Hints unlock after the effort window: first the Portuguese sentence with a gap, then the shape and sounds. Watch for false friends. When only the English word comes to you in real life, save it with "Missing in Portuguese" and try it straight away.'
	},
	A7: {
		title: 'Tip-of-the-tongue log',
		why: 'Tip-of-the-tongue states recur on the same words. Capturing them turns real-life misses into practice items, and finding the word yourself makes it less likely to recur.',
		how: 'Write the meaning you were reaching for; everything else is optional. If you have not found the word yet, you get sound hints before any suggestion.'
	},
	B1: {
		title: 'Word inbox',
		why: 'Recognising a word while reading is not the same as being able to produce it. Capturing it with its sentence is the first step toward using it.',
		how: 'Add the word and, if you can, the sentence you found it in. Check the enrichment, fix what is off, and confirm to start practising it.'
	},
	B2: {
		title: 'Productive review',
		why: 'Retrieving a word from its meaning builds the route you use when speaking. Spacing the reviews makes the gain last.',
		how: 'Produce the word from the definition or the gapped sentence. The grade comes from correctness, time and hints; change it if it is wrong.'
	},
	B3: {
		title: 'Use it',
		why: 'A word becomes yours when you use it correctly in your own sentences, in different contexts, on different days.',
		how: 'Write original sentences with the word. It graduates to active after enough correct uses on separate days.'
	},
	D1: {
		title: 'Ready-to-resume note',
		why: 'About a minute spent writing where you stopped and what comes next reduces what stays on your mind from the old task, and makes coming back faster.',
		how: 'Where you stopped, the one next action (startable in under two minutes), open risks, and what you are waiting on.'
	},
	C1: {
		title: 'Conversation recap',
		why: 'A short recap gives you a record to compare with your later recall. Checking its key points keeps the practice grounded in what you actually meant.',
		how: 'In about two minutes, name who you spoke with, the topic, decisions, open questions and next steps. Review and edit the extracted points before confirming them. Labels or initials are fine.'
	},
	C2: {
		title: 'Delayed recall',
		why: 'Recalling after a delay practises bringing a conversation back from a small cue. Comparing with your confirmed points shows what you missed or changed.',
		how: 'Use the person and topic cue to recall the current state, decisions and open items. Submit before seeing the reference. A graded recall schedules the next review using spaced intervals.'
	},
	C3: {
		title: 'Re-entry drill',
		why: 'A restating opener gives both people a shared starting point when an old topic returns. This drill practises that opener together with accurate recall.',
		how: 'Start to see a vague cue. Write an opener, then the current state and what is open. Accuracy and the opener contribute 80% of the score; time to submit contributes 20%. This version is typed.'
	},
	D2: {
		title: 'Resume drill',
		why: 'Coming back to a task means rebuilding what you were doing and what you were about to do. Recalling before looking strengthens both, and shows what your notes should capture.',
		how: 'Answer from memory first, within 60 seconds. Then compare with the note, and press "Back in flow" once you are working again.'
	},
	F1: {
		title: 'Daily check-in',
		why: 'Word-finding varies from day to day. Recording sleep, energy, stress and exercise lets the app look for patterns in your own data once there is enough of it.',
		how: 'Six quick answers, once a day. Skip any you like.'
	},
	BENCH: {
		title: 'Benchmark',
		why: 'Adaptive practice makes items harder as you improve, so practice scores alone cannot show progress. A fixed-format test on fresh, matched items can.',
		how: 'About 15 minutes, every 4 weeks. Items come from a reserved set you never practise, and nothing here changes your ratings or deck.'
	}
};
