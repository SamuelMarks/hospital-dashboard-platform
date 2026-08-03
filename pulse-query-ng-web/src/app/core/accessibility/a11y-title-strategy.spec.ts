import { TestBed } from '@angular/core/testing';
import { A11yTitleStrategy } from './a11y-title-strategy';
import { Title } from '@angular/platform-browser';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { RouterStateSnapshot } from '@angular/router';

describe('A11yTitleStrategy', () => {
  let strategy: A11yTitleStrategy;
  let titleSpy: { setTitle: any };
  let announcerSpy: { announce: any };

  beforeEach(() => {
    titleSpy = { setTitle: vi.fn() };
    announcerSpy = { announce: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        A11yTitleStrategy,
        { provide: Title, useValue: titleSpy },
        { provide: LiveAnnouncer, useValue: announcerSpy },
      ],
    });
    strategy = TestBed.inject(A11yTitleStrategy);
  });

  it('should set title and announce it when a title is built', () => {
    // Stub buildTitle since it's a protected method of the base class
    vi.spyOn(strategy as any, 'buildTitle').mockReturnValue('Test Title');

    const snapshot = {} as RouterStateSnapshot;
    strategy.updateTitle(snapshot);

    expect(titleSpy.setTitle).toHaveBeenCalledWith('Test Title');
    expect(announcerSpy.announce).toHaveBeenCalledWith('Test Title', 'polite');
  });

  it('should not set title or announce if title is undefined', () => {
    vi.spyOn(strategy as any, 'buildTitle').mockReturnValue(undefined);

    const snapshot = {} as RouterStateSnapshot;
    strategy.updateTitle(snapshot);

    expect(titleSpy.setTitle).not.toHaveBeenCalled();
    expect(announcerSpy.announce).not.toHaveBeenCalled();
  });
});
