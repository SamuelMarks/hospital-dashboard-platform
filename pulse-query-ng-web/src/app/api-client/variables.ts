/**
 * @fileoverview Dependency injection tokens and collection format delimiters for the OpenAPI client.
 */
import { InjectionToken } from '@angular/core';

/**
 * Injection token providing the base URL for OpenAPI HTTP requests.
 */
export const BASE_PATH = new InjectionToken<string>('basePath');

/**
 * Map of OpenAPI collection format identifiers to their separator characters.
 */
export const COLLECTION_FORMATS = {
  csv: ',',
  tsv: '   ',
  ssv: ' ',
  pipes: '|',
};
