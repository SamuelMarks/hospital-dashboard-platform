/**
 * @fileoverview Angular NgModule wrapper providing the OpenAPI `Configuration` singleton.
 */
import { NgModule, ModuleWithProviders, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Configuration } from './configuration';

/**
 * NgModule registering OpenAPI client configuration providers.
 */
@NgModule({
  imports: [],
  declarations: [],
  exports: [],
  providers: [],
})
export class ApiModule {
  /**
   * Creates a root `ModuleWithProviders` configured with a custom `Configuration` factory.
   *
   * @param configurationFactory - Factory function returning a `Configuration` instance.
   * @returns Root `ModuleWithProviders<ApiModule>` registration.
   */
  public static forRoot(configurationFactory: () => Configuration): ModuleWithProviders<ApiModule> {
    return {
      ngModule: ApiModule,
      providers: [{ provide: Configuration, useFactory: configurationFactory }],
    };
  }

  /**
   * Verifies that `ApiModule` is imported only once and that `HttpClient` is available.
   */
  constructor() {
    const parentModule = inject(ApiModule, { optional: true, skipSelf: true });
    const http = inject(HttpClient, { optional: true });
    if (parentModule) {
      throw new Error('ApiModule is already loaded. Import in your base AppModule only.');
    }
    if (!http) {
      throw new Error(
        'You need to import the HttpClientModule in your AppModule! See https://github.com/angular/angular/issues/20575',
      );
    }
  }
}
