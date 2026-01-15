import { TestBed } from '@angular/core/testing';
import { AskDataService } from './ask-data.service';

describe('AskDataService', () => {
  let service: AskDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AskDataService);
  });

  it('should be created with initial state closed', () => {
    expect(service).toBeTruthy();
    expect(service.isOpen()).toBe(false);
  });

  it('should open the sidebar', () => {
    service.open();
    expect(service.isOpen()).toBe(true);
  });

  it('should close the sidebar', () => {
    service.open();
    service.close();
    expect(service.isOpen()).toBe(false);
  });

  it('should toggle state', () => {
    // Initial False -> True
    service.toggle();
    expect(service.isOpen()).toBe(true);

    // True -> False
    service.toggle();
    expect(service.isOpen()).toBe(false);
  });
});