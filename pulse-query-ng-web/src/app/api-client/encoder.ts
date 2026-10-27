/**
 * @fileoverview Custom Angular HttpParameterCodec implementations for OpenAPI query serialization.
 */
import { HttpParameterCodec } from '@angular/common/http';

/**
 * Custom HttpParameterCodec that percent-encodes keys and values using standard `encodeURIComponent`.
 */
export class CustomHttpParameterCodec implements HttpParameterCodec {
  /**
   * Percent-encodes a query parameter key.
   *
   * @param k - Raw parameter key.
   * @returns Encoded parameter key.
   */
  encodeKey(k: string): string {
    return encodeURIComponent(k);
  }

  /**
   * Percent-encodes a query parameter value.
   *
   * @param v - Raw parameter value.
   * @returns Encoded parameter value.
   */
  encodeValue(v: string): string {
    return encodeURIComponent(v);
  }

  /**
   * Decodes a percent-encoded query parameter key.
   *
   * @param k - Encoded parameter key.
   * @returns Decoded parameter key.
   */
  decodeKey(k: string): string {
    return decodeURIComponent(k);
  }

  /**
   * Decodes a percent-encoded query parameter value.
   *
   * @param v - Encoded parameter value.
   * @returns Decoded parameter value.
   */
  decodeValue(v: string): string {
    return decodeURIComponent(v);
  }
}

/**
 * Identity HttpParameterCodec that passes pre-encoded keys and values through unchanged.
 */
export class IdentityHttpParameterCodec implements HttpParameterCodec {
  /**
   * Returns the pre-encoded parameter key unchanged.
   *
   * @param k - Pre-encoded parameter key.
   * @returns Unmodified parameter key.
   */
  encodeKey(k: string): string {
    return k;
  }

  /**
   * Returns the pre-encoded parameter value unchanged.
   *
   * @param v - Pre-encoded parameter value.
   * @returns Unmodified parameter value.
   */
  encodeValue(v: string): string {
    return v;
  }

  /**
   * Returns the parameter key unchanged.
   *
   * @param k - Parameter key.
   * @returns Unmodified parameter key.
   */
  decodeKey(k: string): string {
    return k;
  }

  /**
   * Returns the parameter value unchanged.
   *
   * @param v - Parameter value.
   * @returns Unmodified parameter value.
   */
  decodeValue(v: string): string {
    return v;
  }
}
