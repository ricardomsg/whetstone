import { expect, it } from 'vitest';
import { tailscaleLoginMatches, tailscaleRequestAllowed } from '../src/lib/core/identity';

it('is off when no login is configured', () => {
	expect(tailscaleLoginMatches('someone@example.com', '')).toBe(false);
	expect(tailscaleLoginMatches('someone@example.com', '  ')).toBe(false);
});

it('accepts only exactly the configured login', () => {
	expect(tailscaleLoginMatches('someone@example.com', 'someone@example.com ')).toBe(true);
	expect(tailscaleLoginMatches('Someone@example.com', 'someone@example.com')).toBe(false);
	expect(tailscaleLoginMatches(' someone@example.com', 'someone@example.com')).toBe(false);
	expect(tailscaleLoginMatches(null, 'someone@example.com')).toBe(false);
	expect(tailscaleLoginMatches('', 'someone@example.com')).toBe(false);
	expect(tailscaleLoginMatches('other@example.com', 'someone@example.com')).toBe(false);
});

it('refuses a combined header, as when a forged value is appended', () => {
	expect(tailscaleLoginMatches('other@example.com, someone@example.com', 'someone@example.com')).toBe(false);
	expect(tailscaleLoginMatches('someone@example.com, someone@example.com', 'someone@example.com')).toBe(false);
});

it('accepts the identity only on requests from the app itself or started by the user', () => {
	expect(tailscaleRequestAllowed('same-origin')).toBe(true);
	expect(tailscaleRequestAllowed('none')).toBe(true);
	expect(tailscaleRequestAllowed('cross-site')).toBe(false);
	expect(tailscaleRequestAllowed('same-site')).toBe(false);
	expect(tailscaleRequestAllowed('Same-Origin')).toBe(false);
	expect(tailscaleRequestAllowed(null)).toBe(false);
	expect(tailscaleRequestAllowed('')).toBe(false);
});
