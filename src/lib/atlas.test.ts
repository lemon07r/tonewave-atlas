import { expect, test, vi } from 'vitest';
import type { ProductListItem } from '#core/atlas/types.ts';
import { productList } from './atlas.ts';

const rpc = vi.hoisted(() => ({
	current: Promise.resolve({ products: (): Promise<ProductListItem[]> => Promise.resolve([]) })
}));
vi.mock('./analysis/client.ts', () => ({ getAnalysis: () => rpc.current }));

test('shares lists only within one worker generation and retries failures', async () => {
	const products = vi.fn((): Promise<ProductListItem[]> => Promise.resolve([]));
	rpc.current = Promise.resolve({ products });
	const first = productList('iem');
	expect(productList('iem')).toBe(first);
	await first;
	expect(products).toHaveBeenCalledTimes(1);
	rpc.current = Promise.resolve({ products });
	expect(productList('iem')).not.toBe(first);
	await productList('iem');
	expect(products).toHaveBeenCalledTimes(2);
	products.mockRejectedValueOnce(new Error('network'));
	await expect(productList('headphone')).rejects.toThrow('network');
	await productList('headphone');
	expect(products).toHaveBeenCalledTimes(4);
});
