import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { MpaxArenaRequest } from '../model/mpax-arena-request';
import { MpaxArenaResponse } from '../model/mpax-arena-response';

@Injectable({
  providedIn: 'root',
})
export class MpaxArenaService {
  constructor(private http: HttpClient) {}

  runMpaxArenaApiV1MpaxArenaRunPost(request: MpaxArenaRequest): Observable<MpaxArenaResponse> {
    return this.http.post<MpaxArenaResponse>('/api/v1/mpax_arena/run', request);
  }
}
