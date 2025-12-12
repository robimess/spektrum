import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, 
  IonContent, IonList, IonItem, IonLabel, ModalController 
} from '@ionic/angular/standalone';
import { FeedbackLogService, LogEntry } from '../../services/feedback-log.service';

@Component({
  selector: 'app-feedback-log-modal',
  standalone: true,
  imports: [
    CommonModule, 
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonList, IonItem, IonLabel
  ],
  templateUrl: './feedback-log-modal.component.html',
  styleUrls: ['./feedback-log-modal.component.scss'],
})
export class FeedbackLogModalComponent implements OnInit {
  logs: LogEntry[] = [];

  constructor(
    private modalCtrl: ModalController,
    private feedbackLog: FeedbackLogService
  ) {}

  ngOnInit() {
    this.logs = this.feedbackLog.getLogs();
  }

  close() {
    this.modalCtrl.dismiss();
  }

  exportCsv() {
    this.feedbackLog.downloadCsv();
  }

  clearAll() {
    if (confirm('¿Seguro que deseas eliminar todos los logs?')) {
      this.feedbackLog.clearLogs();
      this.logs = [];
    }
  }

  formatFreq(freq: number): string {
    return freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${freq} Hz`;
  }
}
