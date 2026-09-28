import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { UserRole } from '../models/user-config.model';
import { FeedbackEvent } from '../models/feedback-event.model';

export interface Suggestion {
  id: string;
  message: string;
  frequency: number;
  magnitudeDb: number;
  relativeDb?: number;
  overThresholdDb?: number;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AiSuggestionsService {
  private suggestionsSubject = new BehaviorSubject<Suggestion | null>(null);
  public suggestions$: Observable<Suggestion | null> = this.suggestionsSubject.asObservable();

  private enabled = true;
  private userRole: UserRole = 'foh';

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setUserRole(role: UserRole) {
    this.userRole = role;
  }

  clearSuggestions() {
    this.suggestionsSubject.next(null);
  }

  generateSuggestion(events: FeedbackEvent[]) {
    if (!this.enabled || events.length === 0) return;

    const strongest = events.reduce((max, e) => 
      e.magnitudeDb > max.magnitudeDb ? e : max
    );

    const freq = Math.round(strongest.frequency);
    const severity = this.determineSeverity(strongest.magnitudeDb);
    
    const message = this.buildMessage(strongest, this.userRole);

    const suggestion: Suggestion = {
      id: `sug-${strongest.eventKey}`,
      message,
      frequency: freq,
      magnitudeDb: strongest.magnitudeDb,
      relativeDb: strongest.relativeDb,
      overThresholdDb: strongest.overThresholdDb,
      severity,
      timestamp: Date.now(),
    };

    this.suggestionsSubject.next(suggestion);
  }

  private buildMessage(event: FeedbackEvent, role: UserRole): string {
    const freq = Math.round(event.frequency);
    const freqStr = freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${freq} Hz`;
    const magStr = `${event.magnitudeDb.toFixed(1)} dB`;
    const excessStr = typeof event.overThresholdDb === 'number'
      ? ` | Exceso: +${Math.max(0, event.overThresholdDb).toFixed(1)} dB`
      : '';

    switch (role) {
      case 'foh':
        return `FOH → Feedback en ${freqStr} (${magStr}${excessStr}). Aplique notch estrecho y reduzca ganancia del canal/sistema.`;
      
      case 'monitors':
        return `Monitores → Feedback en ${freqStr} (${magStr}${excessStr}). Revise envío al wedge/IEM y aplique notch en el canal.`;
      
      case 'broadcast':
        return `Broadcast → Feedback en ${freqStr} (${magStr}${excessStr}). Ajuste ganancia y filtre en la cadena de transmisión.`;

      case 'recording':
        return `Recording → Feedback en ${freqStr} (${magStr}${excessStr}). Marque el take y corrija con notch o reposicionando el micrófono antes de continuar.`;
      
      default:
        return `Feedback detectado en ${freqStr} (${magStr}${excessStr}). Reduce ganancia o aplica notch en esa frecuencia.`;
    }
  }

  private determineSeverity(magDb: number): 'low' | 'medium' | 'high' {
    if (magDb > -20) return 'high';
    if (magDb > -40) return 'medium';
    return 'low';
  }
}
