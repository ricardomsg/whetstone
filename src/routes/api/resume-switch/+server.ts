import { json } from '@sveltejs/kit';
import { resumeSwitch } from '$lib/server/exercises/resume';

// The on/off switch for resume prompting. Any hook must check this first.
export const GET = () => json({ on: resumeSwitch() });
export const POST = async ({ request }) => {
	const b = await request.json();
	return json({ on: resumeSwitch(!!b.on) });
};
