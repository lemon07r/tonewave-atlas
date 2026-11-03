const RELOAD_MESSAGE = 'The dataset was updated. Reload to continue.';

/** A pinned session never adopts this new version; dispose/reload to open a fresh session. */
export class DatasetUpdatedError extends Error {
	readonly code = 'dataset-updated';
	readonly reloadMessage = RELOAD_MESSAGE;
	readonly previousVersion: string;
	readonly newVersion: string;
	constructor(previousVersion: string, newVersion: string) {
		// Comlink preserves name/message/stack only. Keep the version payload in a standard Error field
		// so from() also recognises/reconstructs the error after the existing worker transport.
		super(`${RELOAD_MESSAGE}\n${JSON.stringify({ previousVersion, newVersion })}`);
		this.name = 'DatasetUpdatedError';
		this.previousVersion = previousVersion;
		this.newVersion = newVersion;
	}
	static from(error: unknown): DatasetUpdatedError | null {
		if (error instanceof DatasetUpdatedError) return error;
		if (
			!error ||
			typeof error !== 'object' ||
			!('name' in error) ||
			error.name !== 'DatasetUpdatedError' ||
			!('message' in error) ||
			typeof error.message !== 'string' ||
			!error.message.startsWith(`${RELOAD_MESSAGE}\n`)
		)
			return null;
		try {
			const data: unknown = JSON.parse(error.message.slice(RELOAD_MESSAGE.length + 1));
			if (
				data &&
				typeof data === 'object' &&
				'previousVersion' in data &&
				typeof data.previousVersion === 'string' &&
				'newVersion' in data &&
				typeof data.newVersion === 'string'
			)
				return new DatasetUpdatedError(data.previousVersion, data.newVersion);
		} catch {
			/* An unrelated/malformed error is not a dataset-update signal. */
		}
		return null;
	}
}
