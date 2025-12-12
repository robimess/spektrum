import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { UserRole } from '../models/user-config.model';
import { FeedbackEvent } from '../models/feedback-event.model';

export interface Suggestion {
  id: string;
  message: string;
  frequency: number;
  severity: 'low' | 'medium' | 'high';
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class AiSuggestionsService {
  private suggestionsSubject = new Subject<Suggestion>();
  public suggestions$: Observable<Suggestion> = this.suggestionsSubject.asObservable();

  private enabled = true;
  private userRole: UserRole = 'foh';

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setUserRole(role: UserRole) {
    this.userRole = role;
  }

  generateSuggestion(events: FeedbackEvent[]) {
    if (!this.enabled || events.length === 0) return;

    const strongest = events.reduce((max, e) => 
      e.magnitudeDb > max.magnitudeDb ? e : max
    );

    const freq = Math.round(strongest.frequency);
    const severity = this.determineSeverity(strongest.magnitudeDb);
    
    const message = this.buildMessage(freq, this.userRole);

    const suggestion: Suggestion = {
      id: `sug-${Date.now()}`,
      message,
      frequency: freq,
      severity,
      timestamp: Date.now(),
    };

    this.suggestionsSubject.next(suggestion);
  }

  private buildMessage(freq: number, role: UserRole): string {
    const freqStr = freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${freq} Hz`;

    switch (role) {
      case 'foh':
        return `FOH → Detectado feedback en ${freqStr}. Considera atenuar en el EQ general de sala o aplicar filtro notch en la cadena principal.`;
      
      case 'monitors':
        return `Monitores → Feedback en ${freqStr}. Revisa los envíos al monitor afectado y aplica filtro notch en el canal correspondiente.`;
      
      case 'broadcast':
        return `Broadcast → Feedback en ${freqStr}. Verifica las ganancias de entrada y aplica filtro en la cadena de transmisión.`;
      
      default:
        return `Feedback detectado en ${freqStr}. Reduce la ganancia o aplica filtro notch en esa frecuencia.`;
    }
  }

  private determineSeverity(magDb: number): 'low' | 'medium' | 'high' {
    if (magDb > -20) return 'high';
    if (magDb > -40) return 'medium';
    return 'low';
  }
}
