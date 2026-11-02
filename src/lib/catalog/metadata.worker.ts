import { expose } from 'comlink';
import { readCatalogMetadata } from './metadata.ts';

expose({ load: readCatalogMetadata });
