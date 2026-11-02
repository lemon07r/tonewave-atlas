/** Exact source descriptors only: no acoustic or fuzzy equivalence between switch encodings. */
export function switchState(text: string): string | null {
	const impedance = text.match(
		/\b(high|low)[\s-]*(?:imp(?:ed[ae]nce)?\b|[ΩΩ])|\bimp(?:ed[ae]nce)?\s*(?:dial)?\s*[:=-]\s*(high|low)\b/i
	);
	const level = impedance?.[1] ?? impedance?.[2];
	if (level) return `impedance:${level.toLowerCase()}`;
	const code =
		text.match(/(?:\bswitch(?:es)?\s*[:=-]?\s*|\bs\.|^\s*[([]?)([du]{2,8}|[01]{2,8})(?=$|[\s)\]])/i) ??
		text.match(/(?:\s|\()([du]{2,8}|[01]{2,8})\s*[)\]]?\s*$/i);
	if (code?.[1]) return `switch:${/^[du]+$/i.test(code[1]) ? 'du' : 'bits'}:${code[1].toLowerCase()}`;
	const mode = text.match(/\b(?:mode\s*[:=-]\s*([\p{L}\d-]+)|([\p{L}\d-]+)\s+mode)\b/iu);
	if (mode?.[1] || mode?.[2]) return `mode:${(mode[1] ?? mode[2] ?? '').toLowerCase()}`;
	return null;
}

/** Adapter loading is a separate state: low +15 ohm must never vote as bare low impedance. */
export function adapterState(text: string): string | null {
	const matches = [...text.matchAll(/(?:\+\s*|\b)(\d+(?:\.\d+)?)\s*(?:ohms?\b|[ΩΩ])/gi)];
	const value = matches.map((m) => Number(m[1])).find((n) => n > 1);
	return value === undefined ? null : `adapter:${value}ohm`;
}

export function tuningDescriptor(text: string): boolean {
	return (
		switchState(text) !== null ||
		adapterState(text) !== null ||
		/\bimped[ae]nce\b|\b(?:high|low)\s+imp\b|\d\s*ohms?\b|impedance\s+adapter/i.test(text)
	);
}

export function tipDescriptor(text: string): boolean {
	return /tip|insert|shallow|deep|foam|pad|seal|position|\bcp\d{2,3}\b|\b(?:wide|narrow|shorter|standard)\s+bore\b|\b(?:spinfit|sedna|azla|divinus|baroque)\b|\babp-t\b/i.test(
		text
	);
}

/** A suffix is removable only when its exact parent identity is already accepted. */
export function stateSuffix(model: string): { parent: string; label: string } | null {
	const match = model.match(
		/^(.*?)\s+([([]?(?:(?:high|low)[\s-]+imp(?:ed[ae]nce)?(?:\s+(?:setting|mode))?|(?:switch(?:es)?\s*[:=-]?\s*)?(?:[du]{2,8}|[01]{2,8})|[\p{L}\d-]+\s+mode|mode\s*[:=-]\s*[\p{L}\d-]+)[)\]]?)\s*$/iu
	);
	if (!match?.[1] || !match[2]) return null;
	return { parent: match[1].trim(), label: match[2] };
}

/** Cable descriptors do not imply a different acoustic tuning; never strip bare “Balanced” models. */
export function cableDescriptor(text: string): boolean {
	return (
		/\b(?:cable|termination|plug|single[ -]ended)\b|\b[234][.,][45]\s*mm\b|\bbalanced\s+(?:connection|output)\b/i.test(
			text
		) && !/\b(?:mod|modded|DIY|reshell|impedance)\b/i.test(text)
	);
}

export function cableSuffixes(model: string): { parent: string; label: string }[] {
	return [...model.matchAll(/\s+/g)]
		.flatMap((boundary) => {
			const parent = model.slice(0, boundary.index).trim();
			const label = model.slice(boundary.index + boundary[0].length).trim();
			if (!cableDescriptor(label) || /\b(?:tip|pad|earphone|special edition|after burn|batch)\b/i.test(label))
				return [];
			if (
				!/^(?:[([][^()[\]]+[)\]]|(?:with\s+|\+\s*)?[^()[\]]*(?:cable|termination|plug)|(?:standard\s+)?[234][.,][45]\s*mm(?:\s+(?:balanced|single[ -]ended))?|balanced\s+(?:connection|output)|single[ -]ended)$/i.test(
					label
				)
			)
				return [];
			return [{ parent, label }];
		})
		.sort((a, b) => b.parent.length - a.parent.length);
}
