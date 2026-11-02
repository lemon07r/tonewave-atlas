/** Exact source descriptors only: no acoustic or fuzzy equivalence between switch encodings. */
export function switchState(text: string): string | null {
	const impedance = text.match(
		/\b(high|low)[\s-]*(?:imp(?:ed[ae]nce)?\b|[ΩΩ])|\bimp(?:ed[ae]nce)?\s*(?:dial)?\s*[:=-]\s*(high|low)\b/i
	);
	const level = impedance?.[1] ?? impedance?.[2];
	if (level) return `impedance:${level.toLowerCase()}`;
	const code =
		text.match(
			/(?:\bswitch(?:es)?\s*[:=-]?\s*|\bs\.|^\s*[([]?)([du]{2,8}(?:\s+[du]{2,8})?|[01]{2,8}(?:\s+[01]{2,8})?)(?=$|[\s)\]])/i
		) ?? text.match(/(?:\s|\()([du]{2,8}(?:\s+[du]{2,8})?|[01]{2,8}(?:\s+[01]{2,8})?)\s*[)\]]?\s*$/i);
	if (code?.[1]) {
		const value = code[1].replace(/\s+/g, '').toLowerCase();
		return `switch:${/^[du]+$/.test(value) ? 'du' : 'bits'}:${value}`;
	}
	const toggles = [...text.matchAll(/\b(bass|treble|midrange|mid|gain)\s*[:=-]?\s*(on|off)\b/gi)];
	if (toggles.length)
		return `switch:named:${[...new Set(toggles.map((m) => `${m[1]?.toLowerCase()}=${m[2]?.toLowerCase()}`))].sort().join(',')}`;
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
		/\bimped[ae]nce\b|\b(?:high|low)\s+imp\b|\d\s*ohms?\b|impedance\s+adapter|\b(?:bass|tuning)\s+plug\b/i.test(
			text
		)
	);
}

export function tipDescriptor(text: string): boolean {
	return /tip|insert|shallow|deep|foam|pad|seal|position|\bcp\d{2,3}\b|\b(?:wide|narrow|shorter|standard)\s+bore\b|\b(?:spinfit|sedna|azla|divinus|baroque)\b|\babp-t\b|\bjvc\s+spiral\s+dot\b|\bmoondrop\s+spring\b/i.test(
		text
	);
}

/** A suffix is removable only when its exact parent identity is already accepted. */
export function stateSuffix(model: string): { parent: string; label: string } | null {
	const match = model.match(
		/^(.*?)\s+([([]?(?:(?:high|low)[\s-]+imp(?:ed[ae]nce)?(?:\s+(?:setting|mode))?|(?:switch(?:es)?\s*[:=-]?\s*)?(?:[du]{2,8}(?:\s+[du]{2,8})?|[01]{2,8}(?:\s+[01]{2,8})?)|[\p{L}\d-]+\s+mode|mode\s*[:=-]\s*[\p{L}\d-]+)[)\]]?)\s*$/iu
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
			if (
				!cableDescriptor(label) ||
				/\b(?:tip|pad|foam|earphone|special edition|after burn|batch|sample|unit|s\d+)\b/i.test(label)
			)
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

/** Named tips only; never absorb product revisions, samples, mods or switch states into fit. */
export function tipSuffixes(model: string): { parent: string; label: string }[] {
	return [...model.matchAll(/\s+/g)]
		.flatMap((boundary) => {
			const parent = model.slice(0, boundary.index).trim();
			const label = model.slice(boundary.index + boundary[0].length).trim();
			if (
				parent.split('(').length !== parent.split(')').length ||
				parent.split('[').length !== parent.split(']').length
			)
				return [];
			const wrapper = label.match(/^\((.*)\)$|^\[(.*)\]$/);
			const text = (wrapper?.[1] ?? wrapper?.[2] ?? label).trim();
			if (/[()[\]]/.test(text)) return [];
			if (
				/\b(?:sample|unit|s\d+|rev(?:ision)?\s*\d*|20\d{2}|v\d+|mk\d+|harman|balanced|bass|treble|high|low|steel|brass|titanium|copper|nozzle|filter|mod|modded|diy|reshell|cable|plug|dsp|switch)\b/i.test(
					text
				) ||
				tuningDescriptor(text)
			)
				return [];
			if (
				!/^(?:(?:[\p{L}\d+.-]+\s+){0,6}(?:ear)?tips?|(?:[\p{L}\d+.-]+\s+){0,4}(?:foam|(?:wide|narrow|shorter|standard)[ -]bore)|cp\d{2,3}\+?|abp-t|(?:spinfit|sedna|azla|divinus|baroque)\b[^()[\]]*|jvc\s+spiral\s+dot(?:\+{1,2})?|moondrop\s+spring)$/iu.test(
					text
				)
			)
				return [];
			return [{ parent, label }];
		})
		.sort((a, b) => b.parent.length - a.parent.length);
}
