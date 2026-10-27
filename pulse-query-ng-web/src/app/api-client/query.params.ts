/**
 * @fileoverview OpenAPI query parameter builder supporting form, deepObject, and delimited styles.
 */
import { HttpParams, HttpParameterCodec } from '@angular/common/http';
import { CustomHttpParameterCodec, IdentityHttpParameterCodec } from './encoder';

/**
 * OpenAPI query parameter serialization styles.
 */
export enum QueryParamStyle {
  /** JSON-serialized parameter value. */
  Json,
  /** Standard form-style query parameter. */
  Form,
  /** Bracketed nested key-value query parameter. */
  DeepObject,
  /** Space-delimited array parameter. */
  SpaceDelimited,
  /** Pipe-delimited array parameter. */
  PipeDelimited,
}

/**
 * Allowed unencoded delimiter characters for non-exploded collection query parameters.
 */
export type Delimiter = ',' | ' ' | '|';

/**
 * Per-parameter serialization options for `OpenApiHttpParams`.
 */
export interface ParamOptions {
  /** When true, serialized as multiple repeated key=value pairs. */
  explode?: boolean;
  /** Delimiter used when `explode` is false. */
  delimiter?: Delimiter;
}

/**
 * Internal entry storing a parameter's values and resolved serialization options.
 */
interface ParamEntry {
  /** Raw string values associated with the parameter key. */
  values: string[];
  /** Resolved explode and delimiter options. */
  options: Required<ParamOptions>;
}

/**
 * Mutable builder for OpenAPI query parameters supporting per-parameter explode and delimiter options.
 */
export class OpenApiHttpParams {
  /** Internal map of parameter keys to values and serialization options. */
  private params = new Map<string, ParamEntry>();
  /** Default serialization options applied when not overridden per parameter. */
  private defaults: Required<ParamOptions>;
  /** Codec used to percent-encode keys and values. */
  private encoder: HttpParameterCodec;

  /**
   * Initializes a new `OpenApiHttpParams` builder.
   *
   * @param encoder - Optional parameter codec.
   * @param defaults - Optional default `explode` and `delimiter` settings.
   */
  constructor(encoder?: HttpParameterCodec, defaults?: ParamOptions) {
    this.encoder = encoder || new CustomHttpParameterCodec();
    this.defaults = {
      explode: defaults?.explode ?? true,
      delimiter: defaults?.delimiter ?? ',',
    };
  }

  /**
   * Merges optional per-parameter options with the instance defaults.
   *
   * @param local - Optional per-parameter overrides.
   * @returns Fully populated `Required<ParamOptions>`.
   */
  private resolveOptions(local?: ParamOptions): Required<ParamOptions> {
    return {
      explode: local?.explode ?? this.defaults.explode,
      delimiter: local?.delimiter ?? this.defaults.delimiter,
    };
  }

  /**
   * Replaces a parameter's values and optional serialization options.
   *
   * @param key - Query parameter name.
   * @param values - Single string value or array of string values.
   * @param options - Optional serialization overrides.
   * @returns This `OpenApiHttpParams` instance for chaining.
   */
  set(key: string, values: string[] | string, options?: ParamOptions): this {
    const arr = Array.isArray(values) ? values.slice() : [values];
    const opts = this.resolveOptions(options);
    this.params.set(key, { values: arr, options: opts });
    return this;
  }

  /**
   * Appends a single value to the specified query parameter.
   *
   * @param key - Query parameter name.
   * @param value - Value string to append.
   * @param options - Optional serialization overrides.
   * @returns This `OpenApiHttpParams` instance for chaining.
   */
  append(key: string, value: string, options?: ParamOptions): this {
    const entry = this.params.get(key);
    if (entry) {
      if (options) {
        entry.options = this.resolveOptions({ ...entry.options, ...options });
      }
      entry.values.push(value);
    } else {
      this.set(key, [value], options);
    }
    return this;
  }

  /**
   * Serializes all stored parameters into a URL query string.
   *
   * @returns Encoded query string.
   */
  toString(): string {
    const records = this.toRecord();
    const parts: string[] = [];

    for (const key in records) {
      parts.push(`${key}=${records[key]}`);
    }

    return parts.join('&');
  }

  /**
   * Converts stored parameters into a record suitable for `HttpParams.appendAll`.
   *
   * @returns Record mapping encoded keys to encoded values or value arrays.
   */
  toRecord(): Record<string, string | number | boolean | readonly (string | number | boolean)[]> {
    const parts: Record<
      string,
      string | number | boolean | readonly (string | number | boolean)[]
    > = {};

    for (const [key, entry] of this.params.entries()) {
      const encodedKey = this.encoder.encodeKey(key);

      if (entry.options.explode) {
        parts[encodedKey] = entry.values.map((v) => this.encoder.encodeValue(v));
      } else {
        const encodedValues = entry.values.map((v) => this.encoder.encodeValue(v));
        parts[encodedKey] = encodedValues.join(entry.options.delimiter);
      }
    }

    return parts;
  }

  /**
   * Converts this builder into an Angular `HttpParams` instance using `IdentityHttpParameterCodec`.
   *
   * @returns Populated Angular `HttpParams` instance.
   */
  toHttpParams(): HttpParams {
    const records = this.toRecord();
    const httpParams = new HttpParams({ encoder: new IdentityHttpParameterCodec() });
    return httpParams.appendAll(records);
  }
}

/**
 * Flattens an object into delimiter-separated key-value pairs on `OpenApiHttpParams`.
 *
 * @param httpParams - Target `OpenApiHttpParams` accumulator.
 * @param key - Query parameter name.
 * @param item - Object record whose entries should be flattened.
 * @param delimiter - Separator character placed between entries.
 * @returns Updated `OpenApiHttpParams` instance.
 */
export function concatHttpParamsObject(
  httpParams: OpenApiHttpParams,
  key: string,
  item: Record<string, unknown>,
  delimiter: Delimiter,
): OpenApiHttpParams {
  const keyAndValues: string[] = [];

  for (const k in item) {
    keyAndValues.push(k);

    const value = item[k];

    if (Array.isArray(value)) {
      keyAndValues.push(...value.map(convertToString));
    } else {
      keyAndValues.push(convertToString(value));
    }
  }

  return httpParams.set(key, keyAndValues, { explode: false, delimiter: delimiter });
}

/**
 * Converts a Date or primitive value to its string representation.
 *
 * @param value - Value to stringify.
 * @returns ISO-8601 string for `Date` instances, or `String(value)` otherwise.
 */
function convertToString(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  } else {
    return String(value);
  }
}
