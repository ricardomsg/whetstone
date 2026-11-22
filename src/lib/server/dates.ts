import { localDate as dateIn, startOfDay } from '$lib/core/ids';
import { env } from './env';

/** Calendar date in the configured time zone (TZ). */
export const localDate = (ms = Date.now()) => dateIn(ms, env.timezone);

/** The instant today began in the configured time zone. */
export const startOfToday = () => startOfDay(localDate(), env.timezone);
