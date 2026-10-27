/**
 * @fileoverview OpenAPI parameter metadata types and serialization style definitions.
 */

/**
 * Standard parameter styles defined by the OpenAPI specification.
 */
export type StandardParamStyle =
  'matrix' | 'label' | 'form' | 'simple' | 'spaceDelimited' | 'pipeDelimited' | 'deepObject';

/**
 * OpenAPI standard parameter style or custom style identifier.
 */
export type ParamStyle = StandardParamStyle | string;

/**
 * Standard parameter locations defined by the OpenAPI specification.
 */
export type ParamLocation = 'query' | 'header' | 'path' | 'cookie';

/**
 * Standard primitive and composite data types defined by the OpenAPI specification.
 */
export type StandardDataType = 'integer' | 'number' | 'boolean' | 'string' | 'object' | 'array';

/**
 * OpenAPI data type identifier.
 */
export type DataType = StandardDataType | string;

/**
 * Standard data format modifiers defined by the OpenAPI specification.
 */
export type StandardDataFormat =
  'int32' | 'int64' | 'float' | 'double' | 'byte' | 'binary' | 'date' | 'date-time' | 'password';

/**
 * OpenAPI data format modifier or custom format string.
 */
export type DataFormat = StandardDataFormat | string;

/**
 * Descriptor for a single OpenAPI path, query, header, or cookie parameter.
 */
export interface Param {
  /** Parameter name. */
  name: string;
  /** Raw parameter value. */
  value: unknown;
  /** Parameter target location. */
  in: ParamLocation;
  /** OpenAPI serialization style. */
  style: ParamStyle;
  /** Whether composite values should be exploded into separate key-value pairs. */
  explode: boolean;
  /** OpenAPI data type name. */
  dataType: DataType;
  /** Optional OpenAPI format modifier. */
  dataFormat: DataFormat | undefined;
}
