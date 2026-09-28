import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { ModalController } from '@ionic/angular/standalone';

import { FeedbackLogModalComponent } from '../shared/components/feedback-log-modal/feedback-log-modal.component';
import { FeedbackLogService, LogEntry, LogExportResult } from '../shared/services/feedback-log.service';

class MockFeedbackLogService {
  private readonly subject = new BehaviorSubject<LogEntry[]>([]);
  readonly logs$ = this.subject.asObservable();

  getLogs(): LogEntry[] {
    return this.subject.value;
  }

  emit(logs: LogEntry[]) {
    this.subject.next(logs);
  }

  async downloadCsv(): Promise<LogExportResult> {
    return {
      method: 'download',
      success: true,
      message: 'CSV exportado correctamente.',
    };
  }

  clearLogs() {
    this.subject.next([]);
  }
}

describe('FeedbackLogModalComponent', () => {
  let fixture: ComponentFixture<FeedbackLogModalComponent>;
  let component: FeedbackLogModalComponent;
  let logService: MockFeedbackLogService;
  let modalController: jasmine.SpyObj<ModalController>;

  const buildLog = (index: number): LogEntry => ({
    id: `log-${index}`,
    frequency: 1000 + index,
    magnitudeDb: -12,
    timestamp: 1_700_000_000_000 + index,
    isoTimestamp: new Date(1_700_000_000_000 + index).toISOString(),
    timezoneOffsetMinutes: 0,
    duration: 1200,
    occurrences: 1,
    date: '01/01/2026',
    time: '12:00:00',
  });

  beforeEach(async () => {
    modalController = jasmine.createSpyObj<ModalController>('ModalController', ['dismiss', 'getTop']);
    logService = new MockFeedbackLogService();
    modalController.getTop.and.resolveTo({
      dismiss: jasmine.createSpy('dismiss').and.resolveTo(true),
    } as any);

    await TestBed.configureTestingModule({
      imports: [FeedbackLogModalComponent],
      providers: [
        { provide: ModalController, useValue: modalController },
        { provide: FeedbackLogService, useValue: logService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FeedbackLogModalComponent);
    component = fixture.componentInstance;
  });

  it('renders logs incrementally when the history is large', () => {
    logService.emit(Array.from({ length: 250 }, (_value, index) => buildLog(index)));

    fixture.detectChanges();

    expect(component.logs.length).toBe(250);
    expect(component.visibleLogs.length).toBe(100);

    component.loadMore();
    expect(component.visibleLogs.length).toBe(200);
  });

  it('clears logs through the service', () => {
    logService.emit(Array.from({ length: 5 }, (_value, index) => buildLog(index)));
    spyOn(window, 'confirm').and.returnValue(true);

    fixture.detectChanges();
    component.clearAll();

    expect(component.logs.length).toBe(0);
    expect(component.visibleLogs.length).toBe(0);
  });

  it('exports csv and stores the resulting message', async () => {
    fixture.detectChanges();

    await component.exportCsv();

    expect(component.exportMessage).toBe('CSV exportado correctamente.');
  });

  it('closes the topmost modal in a single action', async () => {
    fixture.detectChanges();

    await component.close();

    expect(modalController.getTop).toHaveBeenCalled();
  });
});
