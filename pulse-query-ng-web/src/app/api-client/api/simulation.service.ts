/** 
 * Hospital Analytics Platform
 * Manual sync for Simulation Feature
 */ 

import { Inject, Injectable, Optional } from '@angular/core'; 
import { HttpClient, HttpHeaders } from '@angular/common/http'; 
import { Observable } from 'rxjs'; 

import { BASE_PATH } from '../variables'; 
import { Configuration } from '../configuration'; 
import { BaseService } from '../api.base.service'; 
import { ScenarioRunRequest } from '../model/scenario-run-request'; 
import { ScenarioResult } from '../model/scenario-result'; 

@Injectable({ 
  providedIn: 'root' 
}) 
export class SimulationService extends BaseService { 

    constructor( 
      protected httpClient: HttpClient, 
      @Optional() @Inject(BASE_PATH) basePath: string|string[], 
      @Optional() configuration?: Configuration
    ) { 
        super(basePath, configuration); 
    } 

    /** 
     * Run Scenario
     * Execute "What-If" optimization. 
     */ 
    public runSimulationApiV1SimulationRunPost(request: ScenarioRunRequest): Observable<ScenarioResult> { 
        if (!request) throw new Error('Missing request param'); 

        let localVarHeaders = this.defaultHeaders; 
        localVarHeaders = this.configuration.addCredentialToHeaders('OAuth2PasswordBearer', 'Authorization', localVarHeaders, 'Bearer '); 

        return this.httpClient.request<ScenarioResult>('post', `${this.configuration.basePath}/api/v1/simulation/run`, { 
            body: request, 
            headers: localVarHeaders, 
            responseType: 'json' 
        }); 
    } 
}