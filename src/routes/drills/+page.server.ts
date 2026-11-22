import { coverage, dueCount, countWhere } from '$lib/server/services';
import { dueThreads } from '$lib/server/exercises/threads';

export const load = () => ({ coverage: coverage(), due: dueCount(), learning: countWhere('vocab_entry', "stage = 'learning'"), threadsDue: dueThreads() });
