/** Identity/alias keys only: ordinary text comparison deliberately keeps its old normalisation. */
export function identityKey(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/\+/g, 'plus')
		.replace(/[^\p{L}\p{N}]/gu, '');
}

const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const onlyCjk = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s]+$/u;
const brackets = /\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}|【[^【】]*】/gu;

export function brandKey(value: string): string {
	let stem = value.normalize('NFKC').trim();
	const last = [...stem.matchAll(brackets)].at(-1);
	if (last && last.index + last[0].length === stem.length && cjk.test(last[0]))
		stem = stem.slice(0, last.index).trim();
	const stripped = stem.replace(/\s+(?:audio|acoustics?)$/i, '').trim();
	return identityKey(stripped || stem);
}

export function canonicalBrandKey(value: string, aliases: Readonly<Record<string, string>>): string {
	return brandKey(aliases[brandKey(value)] ?? value);
}

/** Translation annotations are identity metadata; never remove mixed qualifiers or bare tokens. */
export function modelIdentity(value: string): string {
	const model = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
	const stripped = model
		.replace(brackets, (part) => (cjk.test(part) && onlyCjk.test(part.slice(1, -1)) ? ' ' : part))
		.replace(/-([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s]+)-/gu, (part) =>
			cjk.test(part) ? ' ' : part
		)
		.trim()
		.replace(/\s+/g, ' ');
	return /[\p{Script=Latin}\p{N}]/u.test(stripped) ? stripped : model;
}

export function ambiguousCjkModel(value: string): boolean {
	return (
		/[\p{Script=Latin}\p{N}]/u.test(value) &&
		/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]\s*$/u.test(value)
	);
}
