export type Channel = 'avg' | 'L' | 'R';
export type Smoothing = 0 | 24 | 12 | 6 | 3;
export interface CompareState {
	products: string[];
	measurements: string[];
	channel: Channel;
	smoothing: Smoothing;
	difference: string;
}
const identity = /^[a-zA-Z0-9_-]{1,128}$/;
function ids(value: string | null): string[] {
	return [...new Set((value ?? '').split(',').filter((id) => identity.test(id)))];
}
export function parseCompare(params: URLSearchParams): CompareState {
	const products = ids(params.get('p')).slice(0, 6);
	const measurements = ids(params.get('m'))
		.filter((id) => !products.includes(id))
		.slice(0, 6 - products.length);
	const channel = params.get('ch');
	const smoothing = Number(params.get('smooth') ?? 12);
	const difference = params.get('diff') ?? '';
	return {
		products,
		measurements,
		channel: channel === 'L' || channel === 'R' ? channel : 'avg',
		smoothing: [0, 24, 12, 6, 3].includes(smoothing) ? (smoothing as Smoothing) : 12,
		difference: [...products, ...measurements].includes(difference) ? difference : ''
	};
}
/** Preserve shell state and unrelated parameters, but never serialise uploads. */
export function serialiseCompare(state: CompareState, params = new URLSearchParams()): URLSearchParams {
	const result = new URLSearchParams(params);
	for (const key of ['p', 'm', 'ch', 'smooth', 'diff']) result.delete(key);
	if (state.products.length) result.set('p', state.products.join(','));
	if (state.measurements.length) result.set('m', state.measurements.join(','));
	if (state.channel !== 'avg') result.set('ch', state.channel);
	if (state.smoothing !== 12) result.set('smooth', String(state.smoothing));
	if (state.difference) result.set('diff', state.difference);
	return result;
}
