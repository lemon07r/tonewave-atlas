/** Minimal catalog shape; generic combobox items retain any additional caller-owned fields. */
export interface SearchItem {
	id: string;
	label: string;
	group?: string;
	detail?: string;
	variants?: number;
	sources?: number;
}
