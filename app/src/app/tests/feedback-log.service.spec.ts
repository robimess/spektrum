import { TestBed } from '@angular/core/testing';
import { FeedbackLogService } from '../shared/services/feedback-log.service';
import { FeedbackEvent } from '../shared/models/feedback-event.model';

describe('FeedbackLogService', () => {
  let service: FeedbackLogService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(FeedbackLogService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('stores valid events with UTC metadata', () => {
    service.addEvent(createEvent({
      id: 'ev-1',
      frequency: 1000,
      duration: 1400,
      magnitudeDb: -20,
      overThresholdDb: 8,
    }));

    const [entry] = service.getLogs();

    expect(entry.frequency).toBe(1000);
    expect(entry.isoTimestamp).toMatch(/T/);
    expect(Number.isFinite(entry.timezoneOffsetMinutes)).toBeTrue();
  });

  it('rejects invalid frequency values', () => {
    service.addEvent(createEvent({
      id: 'ev-low',
      frequency: 0,
    }));
    service.addEvent(createEvent({
      id: 'ev-high',
      frequency: 25_000,
    }));

    expect(service.getLogs().length).toBe(0);
  });

  it('caps the log to 1000 entries', () => {
    const baseNow = 1_700_000_000_000;
    spyOn(Date, 'now').and.callFake(() => baseNow + counter++ * 15_000);
    let counter = 0;

    for (let i = 0; i < 1005; i++) {
      service.addEvent(createEvent({
        id: `ev-${i}`,
        frequency: 500 + i,
        eventKey: `fb-${i}`,
      }));
    }

    expect(service.getLogs().length).toBe(1000);
  });

  it('falls back to clipboard when download is unavailable', async () => {
    service.addEvent(createEvent({
      id: 'ev-export',
      frequency: 1200,
      eventKey: 'fb-export',
    }));

    spyOn(console, 'warn');
    const originalCreateObjectURL = URL.createObjectURL;
    const originalClipboard = navigator.clipboard;
    const clipboardSpy = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());

    URL.createObjectURL = (() => {
      throw new Error('blocked');
    }) as typeof URL.createObjectURL;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardSpy },
    });

    try {
      const result = await service.downloadCsv();

      expect(result.method).toBe('clipboard');
      expect(result.success).toBeTrue();
      expect(clipboardSpy).toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    }
  });
});

function createEvent(partial: Partial<FeedbackEvent>): FeedbackEvent {
  return {
    id: partial.id ?? 'event',
    eventKey: partial.eventKey ?? 'fb-1',
    frequency: partial.frequency ?? 1000,
    magnitude: partial.magnitude ?? 0.5,
    magnitudeDb: partial.magnitudeDb ?? -18,
    relativeDb: partial.relativeDb ?? 24,
    overThresholdDb: partial.overThresholdDb ?? 7,
    timestamp: partial.timestamp ?? Date.now(),
    lastSeenTimestamp: partial.lastSeenTimestamp ?? Date.now(),
    duration: partial.duration ?? 1500,
    endTimestamp: partial.endTimestamp,
    isActive: partial.isActive ?? false,
  };
}
