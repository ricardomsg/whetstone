import { describe, it, expect } from 'vitest';
import { matchTranslation, isTrap, isCue, shapeHint } from '../src/lib/core/translate';

describe('A8 translation answers', () => {
	it('ignores a leading article or "to"', () => expect(matchTranslation('o prazo', 'prazo')).toBe('exact'));
	it('accepts listed renderings', () => expect(matchTranslation('desistir', 'abandonar', ['desistir'])).toBe('exact'));
	it('takes an inflection the sentence needs', () => expect(matchTranslation('adiaram', 'adiar')).toBe('form'));
	it('does not take a look-alike for an inflection', () => expect(matchTranslation('sensível', 'sensato')).toBe('none'));
	it('spots the false friend', () => expect(isTrap('Atualmente', 'atualmente')).toBe(true));
	it('spots the English word typed back', () => expect(isCue('the deadline', 'deadline')).toBe(true));
	it('shape of an expression', () => expect(shapeHint('custar os olhos da cara', 'pt-PT')).toBe('5 palavras: 6 + 2 + 5 + 2 + 4 letras'));
});
