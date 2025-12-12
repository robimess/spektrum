import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedbackEvent } from '../models/feedback-event.model';

export interface LogEntry {
  id: string;
  frequency: number;
  magnitudeDb: number;
  timestamp: number;
  duration: number;
  date: string;
  time: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackLogService {
  private logs: LogEntry[] = [];
  private logsSubject = new BehaviorSubject<LogEntry[]>([]);
  
  public logs$: Observable<LogEntry[]> = this.logsSubject.asObservable();

  constructor() {
    this.loadFromStorage();
  }

  addEvent(event: FeedbackEvent) {
    if (event.duration < 100) return;

    const date = new Date(event.timestamp);
    const entry: LogEntry = {
      id: event.id,
      frequency: Math.round(event.frequency),
      magnitudeDb: Math.round(event.magnitudeDb * 10) / 10,
      timestamp: event.timestamp,
      duration: event.duration,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };

    this.logs.unshift(entry);
    
    if (this.logs.length > 500) {
      this.logs = this.logs.slice(0, 500);
    }

    this.logsSubject.next([...this.logs]);
    this.saveToStorage();
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.logsSubject.next([]);
    this.saveToStorage();
  }

  exportToCsv(): string {
    const headers = ['Fecha', 'Hora', 'Frecuencia (Hz)', 'Magnitud (dB)', 'Duración (ms)'];
    const rows = this.logs.map(log => [
      log.date,
      log.time,
      log.frequency.toString(),
      log.magnitudeDb.toFixed(1),
      log.duration.toString(),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    return csv;
  }

  downloadCsv() {
    const csv = this.exportToCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spektrum-feedback-log-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private saveToStorage() {
    try {
      localStorage.setItem('spektrum-feedback-logs', JSON.stringify(this.logs));
    } catch (e) {
      console.warn('No se pudo guardar logs en localStorage', e);
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('spektrum-feedback-logs');
      if (stored) {
        this.logs = JSON.parse(stored);
        this.logsSubject.next([...this.logs]);
      }
    } catch (e) {
      console.warn('No se pudo cargar logs desde localStorage', e);
    }
  }
}
