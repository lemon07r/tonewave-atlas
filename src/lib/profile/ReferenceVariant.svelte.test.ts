import { expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductDetail } from '#core/atlas/types.ts';
import ReferenceVariant from './ReferenceVariant.svelte';

const rpc = vi.hoisted(() => ({ detail: vi.fn<() => Promise<ProductDetail>>() }));
vi.mock('#lib/discover/display.ts', () => ({ detail: rpc.detail }));

function entry(
	index: number,
	reviewer: string,
	partition = 'iem-711'
): ProductDetail['measurements'][number] {
	return {
		measurement: {
			id: `m-${index}`,
			productId: 'p',
			sourceId: reviewer,
			partition,
			variant: {
				id: `v-${index}`,
				label: index === 0 ? 'Default' : `Setting ${index}`,
				file: '',
				kind: index === 0 ? 'default' : 'tuning',
				isDefault: index === 0
			},
			channels: [],
			channelContributions: [],
			imbalanceDb: null,
			pairedBins: 0,
			dated: {},
			lastModified: {},
			price: null,
			reviewUrl: null,
			detailFile: '',
			provenance: {
				sourceId: reviewer,
				databaseUrl: '',
				originalUrls: [],
				processing: [],
				calibrationUrl: null
			},
			warnings: []
		},
		source: {
			id: reviewer,
			name: reviewer,
			username: reviewer,
			url: '',
			dbType: 'squig',
			form: 'iem',
			partition,
			rig: null,
			rigInferred: true,
			permission: 'public, not explicitly licensed',
			crawledAt: '',
			calibration: null
		},
		curves: []
	};
}
const measurements = [
	...Array.from({ length: 114 }, (_, i) => entry(i, i < 60 ? 'Reviewer A' : 'Reviewer B')),
	entry(114, 'Reviewer C', 'iem-5128')
];
const data: ProductDetail = {
	ok: true,
	product: {
		id: 'p',
		brand: 'Truthear',
		model: 'Hexa',
		form: 'iem',
		measurementIds: measurements.map((e) => e.measurement.id)
	},
	frequencies: new Float64Array(),
	measurements,
	spread: [],
	variationSpread: []
};

test('defaults to consensus, chooses a reviewer before a measurement and preserves another-rig selection', async () => {
	rpc.detail.mockResolvedValue(data);
	const onchange = vi.fn();
	const screen = await render(ReferenceVariant, {
		productId: 'p',
		name: 'Hexa',
		partition: 'iem-711',
		onchange
	});
	const reviewer = screen.getByRole('combobox', { name: 'Reviewer for Hexa', exact: true });
	await expect.element(reviewer).toHaveValue('');
	await expect
		.element(screen.getByRole('option', { name: 'Consensus of all reviewers (recommended)', exact: true }))
		.toBeInTheDocument();
	expect(screen.container.querySelectorAll('select')).toHaveLength(1);
	await expect
		.element(
			screen.getByRole('option', { name: 'Reviewer A · 60 measurements · 711-family coupler', exact: true })
		)
		.toBeInTheDocument();
	await reviewer.selectOptions('Reviewer B');
	expect(onchange).not.toHaveBeenCalled();
	const measurement = screen.getByRole('combobox', { name: 'Measurement for Hexa', exact: true });
	expect(measurement.element().querySelectorAll('option')).toHaveLength(55);
	await measurement.selectOptions('m-61');
	expect(onchange).toHaveBeenLastCalledWith('m-61');
	await screen.rerender({ measurementId: 'm-61' });
	await expect.element(reviewer).toHaveValue('Reviewer B');
	await screen.rerender({ measurementId: 'm-114' });
	await expect.element(reviewer).toHaveValue('Reviewer C');
	await expect.element(measurement).toHaveValue('m-114');
	await expect
		.element(screen.getByRole('option', { name: /Reviewer C · 1 measurement · B&K 5128/ }))
		.toBeInTheDocument();
	await reviewer.selectOptions('');
	expect(onchange).toHaveBeenLastCalledWith('');
});
