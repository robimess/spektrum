import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { FeedbackEvent, feedbackEventKeyFromFrequency } from '../models/feedback-event.model';

export interface LogEntry {
  id: string;
  eventKey?: string;
  frequency: number;
  magnitudeDb: number;
  timestamp: number;
  isoTimestamp: string;
  timezoneOffsetMinutes: number;
  lastTimestamp?: number;
  duration: number;
  occurrences?: number;
  date: string;
  time: string;
}

export interface LogExportResult {
  readonly method: 'download' | 'clipboard' | 'inline';
  readonly success: boolean;
  readonly message: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackLogService {
  private logs: LogEntry[] = [];
  private logsSubject = new BehaviorSubject<LogEntry[]>([]);
  private lastAcceptedAt = 0;
  private lastAcceptedAtByKey = new Map<string, number>();

  private readonly minLogDurationMs = 650;
  private readonly minOverThresholdDb = 3.2;
  private readonly minMagnitudeDb = -62;
  private readonly duplicateWindowMs = 12000;
  private readonly duplicateFreqToleranceHz = 180;
  private readonly globalMinIntervalMs = 3000;
  private readonly keyMinIntervalMs = 12000;
  private readonly strongEventOverThresholdDb = 8;
  private readonly maxEntries = 1000;
  
  public logs$: Observable<LogEntry[]> = this.logsSubject.asObservable();

  constructor() {
    this.loadFromStorage();
  }

  addEvent(event: FeedbackEvent) {
    const now = Date.now();
    const eventKey = event.eventKey || this.fallbackEventKey(event.frequency);
    const overThresholdDb = event.overThresholdDb ?? 0;
    if (event.duration < this.minLogDurationMs) return;
    if (overThresholdDb < this.minOverThresholdDb) return;
    if (event.magnitudeDb < this.minMagnitudeDb) return;
    if (!this.isValidFrequency(event.frequency)) return;

    const similarIdx = this.findSimilarRecentIndex(eventKey, event.frequency, now);
    if (similarIdx >= 0) {
      this.mergeIntoExistingEntry(similarIdx, event, eventKey, now);
      return;
    }

    const isStrongEvent = overThresholdDb >= this.strongEventOverThresholdDb;
    const lastByKey = this.lastAcceptedAtByKey.get(eventKey) ?? 0;
    if (
      !isStrongEvent &&
      (
        (now - this.lastAcceptedAt) < this.globalMinIntervalMs ||
        (now - lastByKey) < this.keyMinIntervalMs
      )
    ) {
      return;
    }

    const date = new Date(now);
    const entry: LogEntry = {
      id: event.id,
      eventKey,
      frequency: Math.round(event.frequency),
      magnitudeDb: Math.round(event.magnitudeDb * 10) / 10,
      timestamp: now,
      isoTimestamp: date.toISOString(),
      timezoneOffsetMinutes: -date.getTimezoneOffset(),
      lastTimestamp: now,
      duration: Math.round(event.duration),
      occurrences: 1,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };

    this.logs.unshift(entry);
    this.lastAcceptedAt = now;
    this.lastAcceptedAtByKey.set(eventKey, now);
    
    if (this.logs.length > this.maxEntries) {
      this.logs = this.logs.slice(0, this.maxEntries);
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
    const headers = ['Fecha', 'Hora', 'UTC ISO', 'UTC Offset (min)', 'Frecuencia (Hz)', 'Magnitud (dB)', 'Duración (ms)', 'Repeticiones'];
    const rows = this.logs.map(log => [
      log.date,
      log.time,
      log.isoTimestamp,
      String(log.timezoneOffsetMinutes),
      log.frequency.toString(),
      log.magnitudeDb.toFixed(1),
      log.duration.toString(),
      String(log.occurrences ?? 1),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(field => this.csvQuoteField(field)).join(','))
      .join('\r\n');

    return csv;
  }

  private csvQuoteField(field: string): string {
    if (/[",\r\n]/.test(field)) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    if (/^[=+\-@\t\r]/.test(field)) {
      return `'${field}`;
    }
    return field;
  }

  async downloadCsv(): Promise<LogExportResult> {
    const csv = this.exportToCsv();
    const fileName = `spektrum-feedback-log-${Date.now()}.csv`;

    try {
      if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        try {
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.click();
          return {
            method: 'download',
            success: true,
            message: 'CSV exportado correctamente.',
          };
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      console.warn('No se pudo descargar el CSV, intentando fallback.', e);
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(csv);
        return {
          method: 'clipboard',
          success: true,
          message: 'No fue posible descargar el archivo; el CSV se copio al portapapeles.',
        };
      } catch (e) {
        console.warn('No se pudo copiar el CSV al portapapeles.', e);
      }
    }

    return {
      method: 'inline',
      success: false,
      message: 'No fue posible exportar automaticamente. Copia el contenido manualmente desde el historial.',
    };
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
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.logs = parsed
            .map((entry: any) => this.normalizeLoadedEntry(entry))
            .filter((entry: LogEntry | null): entry is LogEntry => entry !== null)
            .slice(0, this.maxEntries);
          this.logs.forEach((entry) => {
            const key = entry.eventKey || this.fallbackEventKey(entry.frequency);
            const ts = entry.lastTimestamp ?? entry.timestamp;
            this.lastAcceptedAtByKey.set(key, ts);
          });
        } else {
          this.logs = [];
        }
        this.logsSubject.next([...this.logs]);
      }
    } catch (e) {
      console.warn('No se pudo cargar logs desde localStorage', e);
    }
  }

  private findSimilarRecentIndex(eventKey: string, frequency: number, now: number): number {
    return this.logs.findIndex(log => {
      const refTimestamp = log.lastTimestamp ?? log.timestamp;
      const withinTime = (now - refTimestamp) <= this.duplicateWindowMs;
      if (!withinTime) return false;
      if (log.eventKey && log.eventKey === eventKey) return true;
      const withinFreq = Math.abs(log.frequency - frequency) <= this.duplicateFreqToleranceHz;
      return withinFreq;
    });
  }

  private mergeIntoExistingEntry(index: number, event: FeedbackEvent, eventKey: string, now: number): void {
    const previous = this.logs[index];
    const prevCount = previous.occurrences ?? 1;
    const nextCount = prevCount + 1;
    const mergedFrequency = Math.round(((previous.frequency * prevCount) + event.frequency) / nextCount);
    const mergedMagnitudeDb = Math.max(previous.magnitudeDb, event.magnitudeDb);
    const mergedDuration = previous.duration + Math.round(event.duration);
    const date = new Date(now);

    const updated: LogEntry = {
      ...previous,
      eventKey: previous.eventKey || eventKey,
      frequency: mergedFrequency,
      magnitudeDb: Math.round(mergedMagnitudeDb * 10) / 10,
      duration: mergedDuration,
      timestamp: now,
      isoTimestamp: date.toISOString(),
      timezoneOffsetMinutes: -date.getTimezoneOffset(),
      lastTimestamp: now,
      occurrences: nextCount,
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };

    this.logs.splice(index, 1);
    this.logs.unshift(updated);
    this.lastAcceptedAt = now;
    this.lastAcceptedAtByKey.set(updated.eventKey ?? eventKey, now);
    this.logsSubject.next([...this.logs]);
    this.saveToStorage();
  }

  private normalizeLoadedEntry(entry: any): LogEntry | null {
    if (!entry) return null;

    const frequency = Number(entry.frequency);
    const magnitudeDb = Number(entry.magnitudeDb);
    const timestamp = Number(entry.timestamp);
    const lastTimestamp = Number(entry.lastTimestamp ?? entry.timestamp);
    const duration = Number(entry.duration);
    const occurrences = Number(entry.occurrences ?? 1);
    const timezoneOffsetMinutes = Number(entry.timezoneOffsetMinutes ?? 0);

    if (!Number.isFinite(frequency) || !Number.isFinite(magnitudeDb) || !Number.isFinite(timestamp)) {
      return null;
    }
    if (!this.isValidFrequency(frequency)) {
      return null;
    }

    const dateObj = new Date(Number.isFinite(lastTimestamp) ? lastTimestamp : timestamp);

    return {
      id: String(entry.id ?? `${timestamp}-${Math.round(frequency)}`),
      eventKey: typeof entry.eventKey === 'string' ? entry.eventKey : this.fallbackEventKey(frequency),
      frequency: Math.round(frequency),
      magnitudeDb: Math.round(magnitudeDb * 10) / 10,
      timestamp,
      isoTimestamp: typeof entry.isoTimestamp === 'string' && entry.isoTimestamp
        ? entry.isoTimestamp
        : new Date(timestamp).toISOString(),
      timezoneOffsetMinutes: Number.isFinite(timezoneOffsetMinutes)
        ? Math.round(timezoneOffsetMinutes)
        : -dateObj.getTimezoneOffset(),
      lastTimestamp: Number.isFinite(lastTimestamp) ? lastTimestamp : timestamp,
      duration: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
      occurrences: Number.isFinite(occurrences) ? Math.max(1, Math.round(occurrences)) : 1,
      date: String(entry.date ?? dateObj.toLocaleDateString()),
      time: String(entry.time ?? dateObj.toLocaleTimeString()),
    };
  }

  private fallbackEventKey(frequency: number): string {
    return feedbackEventKeyFromFrequency(frequency);
  }

  private isValidFrequency(frequency: number): boolean {
    return Number.isFinite(frequency) && frequency >= 20 && frequency <= 22_000;
  }
}
