import { DatasetUpdatedError } from '#core/atlas/errors.ts';

/** Sticky for this page session: a pinned dataset can only be replaced by reloading. */
export const datasetUpdate = $state({ message: '' });

/** Recognise Comlink's name/message-only errors without exposing a generic failure as well. */
export function analysisError(caught: unknown, fallback = 'Analysis unavailable. Please try again.'): string {
	const updated = DatasetUpdatedError.from(caught);
	if (updated) {
		datasetUpdate.message = updated.reloadMessage;
		return '';
	}
	return caught instanceof Error ? caught.message : fallback;
}
