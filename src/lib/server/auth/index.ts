import { verify } from '@node-rs/argon2';
import { eq, lt } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { db, schema } from '../db';
import { env } from '../env';
import { newId } from '$lib/core/ids';

export const COOKIE = 'ws_session';
const TTL = 1000 * 60 * 60 * 24 * 60; // 60 days

export async function checkPassphrase(pass: string): Promise<boolean> {
	if (!env.passphraseHash) return false;
	try {
		return await verify(env.passphraseHash, pass);
	} catch {
		return false;
	}
}

export function createSession(): { id: string; expiresAt: number } {
	db.delete(schema.authSession).where(lt(schema.authSession.expiresAt, Date.now())).run();
	const id = newId('s') + newId();
	const expiresAt = Date.now() + TTL;
	db.insert(schema.authSession).values({ id, expiresAt }).run();
	return { id, expiresAt };
}

export function validSession(id: string | undefined): boolean {
	if (!id) return false;
	const s = db.select().from(schema.authSession).where(eq(schema.authSession.id, id)).get();
	return !!s && s.expiresAt > Date.now();
}

export function deleteSession(id: string) {
	db.delete(schema.authSession).where(eq(schema.authSession.id, id)).run();
}

export function validToken(header: string | null): boolean {
	if (!env.apiToken || !header?.startsWith('Bearer ')) return false;
	const a = Buffer.from(header.slice(7));
	const b = Buffer.from(env.apiToken);
	return a.length === b.length && timingSafeEqual(a, b);
}
