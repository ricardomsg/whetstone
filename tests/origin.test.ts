import { expect, it } from 'vitest';
import { cookieWriteAllowed, safeNext } from '../src/lib/core/origin';

const app = 'https://whetstone.example';

it('allows reads and same-origin writes', () => {
	expect(cookieWriteAllowed('GET', null, app)).toBe(true);
	expect(cookieWriteAllowed('POST', app, app)).toBe(true);
});

it('refuses cookie writes from another origin or with no origin', () => {
	expect(cookieWriteAllowed('POST', 'https://other.example', app)).toBe(false);
	expect(cookieWriteAllowed('DELETE', 'https://sub.whetstone.example', app)).toBe(false);
	expect(cookieWriteAllowed('PUT', null, app)).toBe(false);
});

it('keeps a same-origin login destination with its query and fragment', () => {
	expect(safeNext('/words/1?tab=a#top', app)).toBe('/words/1?tab=a#top');
	expect(safeNext('/a/../b', app)).toBe('/b');
	expect(safeNext(null, app)).toBe('/');
});

it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/.//evil.example', '/a/..//evil.example', '/%2e%2e//evil.example', 'evil'])(
	'sends %j home after login',
	(next) => expect(safeNext(next, app)).toBe('/')
);
