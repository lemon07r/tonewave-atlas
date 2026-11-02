/** EQ labels describe both products-as-sold and externally altered curves. Unknowns are not exclusions. */
export function classifyEq(text: string): 'none' | 'neutral' | 'factory' | 'ambiguous' | 'post-hoc' {
	const clean = text.replace(/\bEcoustic\s+EQ-100\b/gi, 'Ecoustic model');
	if (
		/(?<![\p{L}\p{N}+])\+\s*eq\b|\bauto[\s_-]*eq\b|\beq(?:['’]?d|ed)\b|\bwith\s+eq\b|\beq\s+(?:applied|to\b|HD580P\b)|\beqmine\b/iu.test(
			clean
		) ||
		/\b(?:oratory(?:1990)?|h0llow|tone deaf monk)\b[^()]*\beq\b/i.test(clean)
	)
		return 'post-hoc';
	// Signed/decimal gain lists, not numbered factory names such as 336xx, EQ1 or 3A Games.
	if (
		/\beq\s*[:=-]?\s*(?:custom\s*)?[+-]?\d+(?:\.\d+)?(?:\s*[, +-]\s*[+-]?\d+(?:\.\d+)?){2,}/i.test(clean) ||
		(/[+-]\d+(?:\.\d+)?\s*(?:dB\b|bass\b|treble\b)/i.test(clean) && /\beq\b/i.test(clean))
	)
		return 'post-hoc';
	// An explicitly unaltered user/PEQ slot is still the product as sold.
	if (
		/\b(?:(?:user|custom)\s+eq|eq\s+(?:user|custom))\s*(?:all\s*(?:set\s+to\s*)?(?:0|zero)|\(0\s*gain\))|\bpeq\s*[:=-]?\s*(?:0(?:\s*dB)?\b|no\s+gain|zero\s+gain|default\b|off\b|none\b)|\b0\s*dB\s+peq\b|\beq\s+baseline\b[^()]*\bzero\b/i.test(
			clean
		)
	)
		return 'neutral';
	if (/\b(?:user|custom)\s+p?eq\b|\beq\s*[:=-]?\s*(?:user|custom)\b|\bpeq\b/i.test(clean)) return 'post-hoc';
	if (!/\beq\b|\beq\d+\b|\b(?:basshead|heavy)eq\b|\beqharman\b/i.test(clean)) return 'none';
	// Named curves of uncertain origin must not inherit default status from a neutral-sounding name.
	if (/\bSunrise\b/i.test(clean)) return 'ambiguous';
	if (
		/\b(?:no|null|none|blank|empty|zero|default|standard|stock|pure|flat|neutral|normal|original)[\s_:-]*eq\b|\beq[\s_:=-]*(?:n\/a|none|off|blank|empty|zero|default|standard|stock|original|flat|neutral|normal)\b/i.test(
			clean
		) &&
		!/\b(?:neutral|normal|default|standard)\s*\+(?!\s*anc\b)/i.test(clean)
	)
		return 'neutral';
	const preset =
		'(?:bass(?:head)?|treble|balanced?|dynamic|rock|hi[ -]?fi|classic(?:al)?|electrostatic|electronic|pop(?:ular)?|musical|natural|vocal|clarity|clear|soft|bright|excited|mellow|relaxed|speech|club|folk|serenade|immersive|competition|footsteps|monitor|reference|harman|89xx|336xx|3a)';
	return new RegExp(
		`\\beq\\s*[:=-]?\\s*['"]?${preset}\\b|\\b${preset}(?:\\s+(?:boost|reduction|music|roll))?\\s*\\+?\\s*eq\\b`,
		'i'
	).test(clean)
		? 'factory'
		: 'ambiguous';
}

/** Descriptor vocabulary only; callers remove the maker/model before using it for variant kinds. */
export function factoryMode(text: string): boolean {
	return /\b(?:anc(?:on|off)?|noanc|ambient|transparen(?:t|cy)|aware|dsp|norm|mon|monitor|reference|harman|bass(?:head)?|treble|balanced?|dynamic|rock|hi[ -]?fi|classic(?:al)?|electrostatic|electronic|pop(?:ular)?|musical|natural|vocal|clarity|clear|soft|bright|excited|mellow|relaxed|speech|club|folk|serenade|immersive|competition|footsteps|book whisper|equalization mode)\b|\b(?:89xx|336xx|3a)\b/i.test(
		text
	);
}
