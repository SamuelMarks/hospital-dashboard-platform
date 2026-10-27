/**
 * @fileoverview Standalone Angular provider factory for configuring the generated OpenAPI client.
 */
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { Configuration, ConfigurationParameters } from './configuration';
import { BASE_PATH } from './variables';

/**
 * Returns the environment providers for configuring the OpenAPI client in `ApplicationConfig`.
 *
 * @param configOrBasePath - Base URL string or `ConfigurationParameters` options object.
 * @returns Angular `EnvironmentProviders` registering `BASE_PATH` or `Configuration`.
 */
export function provideApi(
  configOrBasePath: string | ConfigurationParameters,
): EnvironmentProviders {
  return makeEnvironmentProviders([
    typeof configOrBasePath === 'string'
      ? { provide: BASE_PATH, useValue: configOrBasePath }
      : {
          provide: Configuration,
          useValue: new Configuration({ ...configOrBasePath }),
        },
  ]);
}
