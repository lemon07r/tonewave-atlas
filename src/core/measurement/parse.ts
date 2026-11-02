/** Portable REW/delimited frequency-response reader; phase is intentionally ignored. */
export interface MeasurementPoints {
	hz: Float64Array;
	db: Float64Array;
	/** Verbatim REW date: no timezone is invented. */
	dated: string | null;
}

export type ParseResult =
	| { ok: true; points: MeasurementPoints; warnings: string[] }
	| { ok: false; error: string; warnings: string[] };

export interface ParseOptions {
	minPoints?: number;
	/** Required coverage endpoints; override for intentionally narrow-band uploads. */
	maxStartHz?: number;
	minEndHz?: number;
}

function fields(line: string): string[] {
	// Comma decimals are unambiguous only with another explicit field separator.
	if (/[;\t]/.test(line)) return line.split(/[;\t]+/).map((v) => v.trim().replace(',', '.'));
	if (/\s/.test(line) && !/,\s/.test(line)) {
		const parts = line.split(/\s+/);
		if (parts.length >= 2 && parts.every((s) => /^[+-]?\d+(?:,\d+)?(?:e[+-]?\d+)?$/i.test(s))) {
			return parts.map((s) => s.replace(',', '.'));
		}
	}
	return line.split(/[\s,]+/);
}

/** Drops nonfinite rows, sorts and averages duplicate frequencies. Bad text is a result, not an exception. */
export function parseMeasurement(text: string, options: ParseOptions = {}): ParseResult {
	const warnings: string[] = [];
	const rows: [number, number][] = [];
	let dated: string | null = null;
	let dropped = 0;
	let invalidHz = false;
	let implausible = false;
	for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		if (/^[*#]/.test(line)) {
			const date = /\bDated:\s*(.+)$/i.exec(line)?.[1];
			if (date) dated = date.trim();
			continue;
		}
		const parts = fields(line);
		const first = parts[0] ?? '';
		// Recognise optional column headers, but count other malformed rows.
		if (/^(?:freq(?:uency)?|hz)\b/i.test(first)) continue;
		const hz = Number(first);
		const db = parts[1] ? Number(parts[1]) : NaN;
		if (!Number.isFinite(hz) || !Number.isFinite(db)) {
			dropped++;
			continue;
		}
		if (hz <= 0) invalidHz = true;
		if (db < -200 || db > 200) implausible = true;
		rows.push([hz, db]);
	}
	if (dropped) warnings.push(`Dropped ${dropped} malformed/nonfinite rows`);
	if (invalidHz) return { ok: false, error: 'Frequency must be positive', warnings };
	if (implausible) return { ok: false, error: 'Level outside plausible -200…200 dB range', warnings };
	const sorted = rows.every((r, i) => i === 0 || r[0] >= (rows[i - 1]?.[0] ?? 0));
	rows.sort((a, b) => a[0] - b[0]);
	if (!sorted) warnings.push('Sorted frequencies');
	const frequencies: number[] = [];
	const levels: number[] = [];
	let duplicates = 0;
	for (let i = 0; i < rows.length;) {
		const row = rows[i];
		if (!row) break;
		const frequency = row[0];
		let sum = 0;
		let n = 0;
		while (rows[i]?.[0] === frequency) {
			sum += rows[i]?.[1] ?? 0;
			i++;
			n++;
		}
		frequencies.push(frequency);
		levels.push(sum / n);
		duplicates += n - 1;
	}
	if (duplicates) warnings.push(`Merged ${duplicates} duplicate frequencies (dB mean)`);
	if (frequencies.length < (options.minPoints ?? 16)) {
		return { ok: false, error: 'Not enough distinct frequency points', warnings };
	}
	if (
		(frequencies[0] ?? Infinity) > (options.maxStartHz ?? 200) ||
		(frequencies.at(-1) ?? 0) < (options.minEndHz ?? 8000)
	) {
		return { ok: false, error: 'Insufficient frequency coverage', warnings };
	}
	return {
		ok: true,
		points: { hz: Float64Array.from(frequencies), db: Float64Array.from(levels), dated },
		warnings
	};
}
