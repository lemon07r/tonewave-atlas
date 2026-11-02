/** Bounded async LRU. Failed requests are retryable, including after eviction/replacement. */
export class AsyncLru<K, V> {
	private entries = new Map<K, Promise<V>>();
	private readonly limit: number;
	constructor(limit: number) {
		this.limit = limit;
	}
	get(key: K, load: () => Promise<V>): Promise<V> {
		let pending = this.entries.get(key);
		if (pending) this.entries.delete(key);
		else {
			pending = load();
			const request = pending;
			void pending.catch(() => {
				if (this.entries.get(key) === request) this.entries.delete(key);
			});
		}
		this.entries.set(key, pending);
		while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value as K);
		return pending;
	}
}
