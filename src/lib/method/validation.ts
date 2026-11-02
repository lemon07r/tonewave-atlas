import { catalogMetadata } from '#lib/catalog/client.ts';
import type { ValidationFigure } from './figures.ts';
export { validationFigures, type ValidationFigure } from './figures.ts';

/** Parsing and projection happen in the UI metadata worker, shared with identity migration. */
export async function loadValidation(url: string, signal: AbortSignal): Promise<ValidationFigure[]> {
	signal.throwIfAborted();
	const metadata = await catalogMetadata(url);
	signal.throwIfAborted();
	return metadata.validation;
}
