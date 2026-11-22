import { getSettings } from '$lib/server/settings';
export const load = () => ({ lang: getSettings().defaultLang === 'pt-PT' ? 'pt-PT' : 'en' });
