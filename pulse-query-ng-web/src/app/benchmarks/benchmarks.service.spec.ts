import { TestBed } from '@angular/core/testing';
import { BenchmarksService } from './benchmarks.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

describe('BenchmarksService', () => {
  let service: BenchmarksService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BenchmarksService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BenchmarksService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should fetch sql benchmarks', () => {
    const dummy = [{ theme: 'T1' }];
    service.getSqlBenchmarks().subscribe((res) => {
      expect(res).toEqual(dummy);
    });

    const req = httpMock.expectOne('/api/v1/benchmarks/sql');
    expect(req.request.method).toBe('GET');
    req.flush(dummy);
  });

  it('should fetch mpax benchmarks', () => {
    const dummy = [{ id: '1' }];
    service.getMpaxBenchmarks().subscribe((res) => {
      expect(res).toEqual(dummy);
    });

    const req = httpMock.expectOne('/api/v1/benchmarks/mpax');
    expect(req.request.method).toBe('GET');
    req.flush(dummy);
  });
});
