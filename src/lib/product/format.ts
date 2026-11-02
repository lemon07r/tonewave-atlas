export function signedDb(value: number): string {
	if (!Number.isFinite(value)) return '—';
	const magnitude = Math.abs(value).toFixed(1);
	return `${value < 0 && Number(magnitude) !== 0 ? '−' : '+'}${magnitude}`;
}
