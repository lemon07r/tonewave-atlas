import * as Comlink from 'comlink';
import { expect, it } from 'vitest';
import { DatasetUpdatedError } from './errors.ts';

it('preserves the typed dataset-update signal through the existing Comlink error transport', async () => {
	const error = new DatasetUpdatedError('v1', 'v2');
	const channel = new MessageChannel();
	const api = {
		fail(): void {
			throw error;
		}
	};
	Comlink.expose(api, channel.port1);
	const remote = Comlink.wrap<typeof api>(channel.port2);
	try {
		await remote.fail().then(
			() => {
				throw new Error('Expected rejection');
			},
			(caught: unknown) => {
				expect(caught).toMatchObject({ name: 'DatasetUpdatedError', message: error.message });
				expect(caught).not.toHaveProperty('newVersion');
				expect(DatasetUpdatedError.from(caught)).toMatchObject({
					code: 'dataset-updated',
					previousVersion: 'v1',
					newVersion: 'v2',
					reloadMessage: 'The dataset was updated. Reload to continue.'
				});
			}
		);
	} finally {
		remote[Comlink.releaseProxy]();
		channel.port1.close();
		channel.port2.close();
	}
});

it('does not misidentify unrelated or malformed errors as a dataset update', () => {
	const own = new DatasetUpdatedError('v1', 'v2');
	expect(DatasetUpdatedError.from(own)).toBe(own);
	for (const error of [
		null,
		'dataset-updated',
		new Error('network failure'),
		{ name: 'DatasetUpdatedError', message: 'bad payload' },
		{ name: 'DatasetUpdatedError', message: 'The dataset was updated. Reload to continue.\n{"newVersion":2}' }
	])
		expect(DatasetUpdatedError.from(error)).toBeNull();
});
