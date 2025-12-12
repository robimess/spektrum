import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject } from 'rxjs';
import { FeedbackEvent } from '../feedback/feedback-detector.service';

export interface LogEntry {
  readonly event: FeedbackEvent;
  readonly userNote?: string;
  readonly resolved: boolean;
}

export interface LogMetadata {
  readonly version: string;
  readonly totalEvents: number;
  readonly lastUpdate: string;
  readonly sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class FeedbackLogService {
  private readonly STORAGE_KEY = 'spektrum_feedback_logs';
  private readonly METADATA_KEY = 'spektrum_log_metadata';
  private readonly VERSION = '2.0';
  private readonly MAX_ENTRIES = 1000;

  private logsSubject: BehaviorSubject<LogEntry[]>;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    const logs = this.loadLogs();
    this.logsSubject = new BehaviorSubject<LogEntry[]>(logs);
  }

  get logs$(): Observable<LogEntry[]> {
    return this.logsSubject.asObservable();
  }

  getLogs(): LogEntry[] {
    return this.logsSubject.value;
  }

  addEvent(event: FeedbackEvent): void {
    const logs = this.logsSubject.value;
    const entry: LogEntry = {
      event,
      resolved: false
    };

    const updated = [entry, ...logs].slice(0, this.MAX_ENTRIES);
    this.saveLogs(updated);
    this.logsSubject.next(updated);
  }

  updateEntry(eventId: string, updates: Partial<LogEntry>): void {
    const logs = this.logsSubject.value;
    const index = logs.findIndex(entry => entry.event.id === eventId);

    if (index !== -1) {
      const updated = [...logs];
      updated[index] = { ...updated[index], ...updates };
      this.saveLogs(updated);
      this.logsSubject.next(updated);
    }
  }

  deleteEntry(eventId: string): void {
    const logs = this.logsSubject.value;
    const filtered = logs.filter(entry => entry.event.id !== eventId);
    this.saveLogs(filtered);
    this.logsSubject.next(filtered);
  }

  clearLogs(): void {
    this.saveLogs([]);
    this.logsSubject.next([]);
  }

  exportToCsv(): string {
    const logs = this.logsSubject.value;
    const headers = [
      'ID',
      'Timestamp',
      'Frequency (Hz)',
      'Magnitude (dB)',
      'Q-Factor',
      'Bandwidth (Hz)',
      'Severity',
      'Duration (ms)',
      'Octave Band',
      'Note',
      'Resolved'
    ];

    const rows = logs.map(entry => {
      const e = entry.event;
      return [
        e.id,
        e.timestamp.toISOString(),
        e.frequency.toFixed(2),
        e.magnitudeDb.toFixed(2),
        e.qFactor.toFixed(2),
        e.bandwidth.toFixed(2),
        e.severity,
        e.duration.toFixed(0),
        e.octaveBand || '',
        entry.userNote || '',
        entry.resolved ? 'Yes' : 'No'
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  downloadCsv(filename?: string): void {
    const csv = this.exportToCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    const defaultFilename = `spektrum-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    link.href = URL.createObjectURL(blob);
    link.download = filename || defaultFilename;
    link.click();
    
    URL.revokeObjectURL(link.href);
  }

  getStatistics() {
    const logs = this.logsSubject.value;
    const totalEvents = logs.length;
    const resolvedCount = logs.filter(l => l.resolved).length;
    const unresolvedCount = totalEvents - resolvedCount;

    const severityCounts = logs.reduce((acc, entry) => {
      const severity = entry.event.severity;
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgFrequency = logs.length > 0
      ? logs.reduce((sum, entry) => sum + entry.event.frequency, 0) / logs.length
      : 0;

    const avgQFactor = logs.length > 0
      ? logs.reduce((sum, entry) => sum + entry.event.qFactor, 0) / logs.length
      : 0;

    return {
      totalEvents,
      resolvedCount,
      unresolvedCount,
      severityCounts,
      avgFrequency,
      avgQFactor
    };
  }

  private loadLogs(): LogEntry[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      return parsed.map((entry: any) => ({
        ...entry,
        event: {
          ...entry.event,
          timestamp: new Date(entry.event.timestamp)
        }
      }));
    } catch (error) {
      console.error('Failed to load logs:', error);
      return [];
    }
  }

  private saveLogs(logs: LogEntry[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
      this.saveMetadata(logs);
    } catch (error) {
      console.error('Failed to save logs:', error);
    }
  }

  private saveMetadata(logs: LogEntry[]): void {
    const metadata: LogMetadata = {
      version: this.VERSION,
      totalEvents: logs.length,
      lastUpdate: new Date().toISOString(),
      sessionId: this.sessionId
    };
    
    try {
      localStorage.setItem(this.METADATA_KEY, JSON.stringify(metadata));
    } catch (error) {
      console.error('Failed to save metadata:', error);
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
