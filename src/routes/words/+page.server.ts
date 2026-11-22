import { listVocab } from '$lib/server/exercises/vocab';

export const load = () => {
	const all = listVocab();
	return { inbox: all.filter((v) => v.stage === 'inbox'), learning: all.filter((v) => v.stage === 'learning'), active: all.filter((v) => v.stage === 'active') };
};
