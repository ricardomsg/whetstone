import { it, expect } from 'vitest';
import { db, schema } from '../src/lib/server/db';
import { chooseItem } from '../src/lib/server/services';

it('a card whose definition was shown for an answer in the other language counts as seen', () => {
	const card = (id: string, lang: 'en' | 'pt-PT', pair: string) => ({ id, exercise: 'A1', lang, target: id, prompt: { definition: id, pair }, source: 'seed' });
	db.insert(schema.item).values([card('en-a', 'en', 'pt-a'), card('pt-a', 'pt-PT', 'en-a'), card('en-b', 'en', 'pt-b'), card('pt-b', 'pt-PT', 'en-b')]).run();
	db.insert(schema.attempt).values({ id: 'x1', exercise: 'A1', lang: 'pt-PT', itemId: 'pt-a', startedAt: Date.now(), input: { shownDef: 'en-a' } }).run();
	for (let k = 0; k < 10; k++) expect(chooseItem('A1', 'en', 'WR', { where: (i) => !!i.prompt.pair })?.id).toBe('en-b');
});
