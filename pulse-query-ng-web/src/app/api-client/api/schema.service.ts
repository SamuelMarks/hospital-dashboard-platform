/**
 * Hospital Analytics Platform
 * Manual definition for Schema API
 */

import { Inject, Injectable, Optional } from '@angular/core'; 
import { HttpClient, HttpHeaders } from '@angular/common/http'; 
import { Observable } from 'rxjs'; 

import { BASE_PATH } from '../variables'; 
import { Configuration } from '../configuration'; 
import { BaseService } from '../api.base.service'; 
import { TableInfo } from '../model/table-info'; 

@Injectable({ 
  providedIn: 'root' 
}) 
export class SchemaService extends BaseService { 

    constructor(
      protected httpClient: HttpClient, 
      @Optional() @Inject(BASE_PATH) basePath: string|string[], 
      @Optional() configuration?: Configuration
    ) { 
        super(basePath, configuration); 
    } 

    /**
     * Get Database Schema
     * Retrive table and column definitions for autocomplete.
     */
    public getDatabaseSchemaApiV1SchemaGet(): Observable<Array<TableInfo>> { 
        let localVarHeaders = this.defaultHeaders; 
        localVarHeaders = this.configuration.addCredentialToHeaders('OAuth2PasswordBearer', 'Authorization', localVarHeaders, 'Bearer '); 

        return this.httpClient.request<Array<TableInfo>>('get', `${this.configuration.basePath}/api/v1/schema/`, { 
            headers: localVarHeaders, 
            responseType: 'json' 
        }); 
    } 
}