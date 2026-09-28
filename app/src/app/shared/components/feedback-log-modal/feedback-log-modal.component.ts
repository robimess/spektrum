import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonIcon, ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, downloadOutline, trashOutline, documentTextOutline } from 'ionicons/icons';
import { FeedbackLogService, LogEntry } from '../../services/feedback-log.service';

@Component({
  selector: 'app-feedback-log-modal',
  standalone: true,
  imports: [
    CommonModule, 
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonIcon
  ],
  templateUrl: './feedback-log-modal.component.html',
  styleUrls: ['./feedback-log-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackLogModalComponent implements OnInit, OnDestroy {
  private readonly modalCtrl = inject(ModalController);
  private readonly feedbackLog = inject(FeedbackLogService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly pageSize = 100;

  logs: LogEntry[] = [];
  visibleLogs: LogEntry[] = [];
  visibleCount = this.pageSize;
  exportMessage = '';
  private readonly subs = new Subscription();

  constructor() {
    addIcons({ closeOutline, downloadOutline, trashOutline, documentTextOutline });
  }

  ngOnInit() {
    this.applyLogs(this.feedbackLog.getLogs());
    this.subs.add(
      this.feedbackLog.logs$.subscribe(logs => {
        this.applyLogs(logs);
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  async close() {
    const top = await this.modalCtrl.getTop();
    await top?.dismiss(undefined, 'close');
  }

  async exportCsv() {
    const result = await this.feedbackLog.downloadCsv();
    this.exportMessage = result.message;
    this.cdr.markForCheck();
  }

  async exportTxt() {
    const result = await this.feedbackLog.downloadTxt();
    this.exportMessage = result.message;
    this.cdr.markForCheck();
  }

  clearAll() {
    const confirmed = typeof window === 'undefined' || typeof window.confirm !== 'function'
      ? true
      : window.confirm('¿Seguro que deseas eliminar todos los logs?');
    if (confirmed) {
      this.feedbackLog.clearLogs();
      this.visibleCount = this.pageSize;
      this.exportMessage = '';
    }
  }

  loadMore() {
    this.visibleCount = Math.min(this.visibleCount + this.pageSize, this.logs.length);
    this.visibleLogs = this.logs.slice(0, this.visibleCount);
    this.cdr.markForCheck();
  }

  trackByLogId(_index: number, log: LogEntry): string {
    return log.id;
  }

  formatFreq(freq: number): string {
    return freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${freq} Hz`;
  }

  private applyLogs(logs: LogEntry[]) {
    this.logs = logs;
    this.visibleCount = Math.min(Math.max(this.pageSize, this.visibleCount), logs.length || this.pageSize);
    this.visibleLogs = logs.slice(0, Math.min(this.visibleCount, logs.length));
    this.cdr.markForCheck();
  }
}
