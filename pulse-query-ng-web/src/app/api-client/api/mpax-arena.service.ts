/* v8 ignore start */
/** @docs */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MpaxArenaRequest } from '../model/mpax-arena-request';
import { MpaxArenaResponse } from '../model/mpax-arena-response';

/** @docs */
@Injectable({
  providedIn: 'root',
})
/** @docs */
export class MpaxArenaService {
  private readonly http = inject(HttpClient);

  runMpaxArenaApiV1MpaxArenaRunPost(request: MpaxArenaRequest): Observable<MpaxArenaResponse> {
    return this.http.post<MpaxArenaResponse>('/api/v1/mpax_arena/run', request);
  }
}
