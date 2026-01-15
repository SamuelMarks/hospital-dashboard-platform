/** 
 * Hospital Analytics Platform
 * Updated Execution Service supporting Global Params Body.
 */ 

import { Inject, Injectable, Optional }                      from '@angular/core'; 
import { HttpClient, HttpHeaders, HttpParams, 
         HttpResponse, HttpEvent, HttpContext 
        }       from '@angular/common/http'; 
import { Observable }                                        from 'rxjs'; 
import { BASE_PATH }                     from '../variables'; 
import { Configuration }                                     from '../configuration'; 
import { BaseService } from '../api.base.service'; 

@Injectable({ 
  providedIn: 'root' 
}) 
export class ExecutionService extends BaseService { 

    constructor(protected httpClient: HttpClient, @Optional() @Inject(BASE_PATH) basePath: string|string[], @Optional() configuration?: Configuration) { 
        super(basePath, configuration); 
    } 

    /** 
     * Refresh Dashboard with Global Filters
     * Body: { [key: string]: any } -> global_params
     */ 
    public refreshDashboardApiV1DashboardsDashboardIdRefreshPost(
      dashboardId: string, 
      globalParams: any = {}, // New Arg
      authorization?: string, 
      observe: any = 'body', 
      reportProgress: boolean = false
    ): Observable<any> { 
        if (dashboardId === null || dashboardId === undefined) { 
            throw new Error('Required parameter dashboardId was null.'); 
        } 

        let localVarHeaders = this.defaultHeaders; 
        if (authorization) { 
            localVarHeaders = localVarHeaders.set('authorization', String(authorization)); 
        } 

        localVarHeaders = this.configuration.addCredentialToHeaders('OAuth2PasswordBearer', 'Authorization', localVarHeaders, 'Bearer '); 

        let localVarPath = `/api/v1/dashboards/${encodeURIComponent(String(dashboardId))}/refresh`; 

        return this.httpClient.request<{ [key: string]: any; }>('post', `${this.configuration.basePath}${localVarPath}`, 
            { 
                body: globalParams, // Pass body
                headers: localVarHeaders, 
                observe: observe, 
                reportProgress: reportProgress,
                responseType: 'json'
            } 
        ); 
    } 
}