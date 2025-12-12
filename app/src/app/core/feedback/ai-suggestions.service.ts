import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { FeedbackEvent, FeedbackSeverity } from '../feedback/feedback-detector.service';
import { UserRole } from '../storage/config-storage.service';

export interface AISuggestion {
  readonly feedbackEvent: FeedbackEvent;
  readonly primaryAction: string;
  readonly secondaryActions: string[];
  readonly technicalDetails: string;
  readonly userRole: UserRole;
  readonly timestamp: Date;
}

@Injectable({ providedIn: 'root' })
export class AISuggestionsService {
  private suggestionsSubject = new Subject<AISuggestion>();

  get suggestions$(): Observable<AISuggestion> {
    return this.suggestionsSubject.asObservable();
  }

  generateSuggestion(event: FeedbackEvent, userRole: UserRole): void {
    const suggestion = this.buildSuggestion(event, userRole);
    this.suggestionsSubject.next(suggestion);
  }

  private buildSuggestion(event: FeedbackEvent, userRole: UserRole): AISuggestion {
    const freq = event.frequency;
    const qFactor = event.qFactor;
    const severity = event.severity;

    let primaryAction = '';
    const secondaryActions: string[] = [];
    let technicalDetails = '';

    const freqLabel = this.getFrequencyLabel(freq);

    switch (userRole) {
      case UserRole.FOH:
        primaryAction = this.getFOHPrimaryAction(freq, severity, qFactor);
        secondaryActions.push(...this.getFOHSecondaryActions(freq, severity));
        technicalDetails = this.getFOHTechnical(event, freqLabel);
        break;

      case UserRole.MONITORS:
        primaryAction = this.getMonitorsPrimaryAction(freq, severity, qFactor);
        secondaryActions.push(...this.getMonitorsSecondaryActions(freq, severity));
        technicalDetails = this.getMonitorsTechnical(event, freqLabel);
        break;

      case UserRole.BROADCAST:
        primaryAction = this.getBroadcastPrimaryAction(freq, severity, qFactor);
        secondaryActions.push(...this.getBroadcastSecondaryActions(freq, severity));
        technicalDetails = this.getBroadcastTechnical(event, freqLabel);
        break;

      case UserRole.RECORDING:
        primaryAction = this.getRecordingPrimaryAction(freq, severity, qFactor);
        secondaryActions.push(...this.getRecordingSecondaryActions(freq, severity));
        technicalDetails = this.getRecordingTechnical(event, freqLabel);
        break;
    }

    return {
      feedbackEvent: event,
      primaryAction,
      secondaryActions,
      technicalDetails,
      userRole,
      timestamp: new Date()
    };
  }

  private getFOHPrimaryAction(freq: number, severity: FeedbackSeverity, qFactor: number): string {
    if (severity === FeedbackSeverity.CRITICAL) {
      return `CRITICAL: Reduce ${freq.toFixed(0)} Hz en EQ principal o baje ganancia del sistema`;
    }
    
    if (qFactor > 20) {
      return `Aplicar corte estrecho de -${this.getSuggestedCutDb(severity)} dB en ${freq.toFixed(0)} Hz (Q=${qFactor.toFixed(1)})`;
    }
    
    return `Reducir ${freq.toFixed(0)} Hz con Q moderado (3-5) en EQ gráfico o paramétrico`;
  }

  private getFOHSecondaryActions(freq: number, severity: FeedbackSeverity): string[] {
    const actions = [];
    
    if (freq < 200) {
      actions.push('Revisar posición de subwoofers respecto a micrófonos');
      actions.push('Considerar high-pass filter en canal problemático');
    } else if (freq > 4000) {
      actions.push('Revisar orientación de tweeters o HF horn');
      actions.push('Ajustar angulación de arrays lineales');
    }

    actions.push('Verificar distancia micrófono-PA');
    actions.push('Reducir ganancia antes del feedback (GBF)');

    if (severity === FeedbackSeverity.CRITICAL || severity === FeedbackSeverity.HIGH) {
      actions.push('Considerar mover micrófonos fuera de patrón directo de PA');
    }

    return actions;
  }

  private getFOHTechnical(event: FeedbackEvent, freqLabel: string): string {
    return `Frecuencia: ${event.frequency.toFixed(1)} Hz (${freqLabel}) | ` +
           `Magnitud: ${event.magnitudeDb.toFixed(1)} dB | ` +
           `Q-Factor: ${event.qFactor.toFixed(1)} | ` +
           `Ancho de banda: ${event.bandwidth.toFixed(1)} Hz | ` +
           `Octava: ${event.octaveBand}`;
  }

  private getMonitorsPrimaryAction(freq: number, severity: FeedbackSeverity, qFactor: number): string {
    if (severity === FeedbackSeverity.CRITICAL) {
      return `URGENTE: Baje fader del canal o reduzca ${freq.toFixed(0)} Hz en EQ de monitor`;
    }

    if (qFactor > 25) {
      return `Corte quirúrgico -${this.getSuggestedCutDb(severity)} dB en ${freq.toFixed(0)} Hz en wedge/IEM EQ`;
    }

    return `Reducir ${freq.toFixed(0)} Hz en EQ de monitor o en canal de retorno`;
  }

  private getMonitorsSecondaryActions(freq: number, severity: FeedbackSeverity): string[] {
    const actions = [];

    if (freq < 250) {
      actions.push('Revisar proximity effect de micrófonos');
      actions.push('Implementar high-pass filter en 80-100 Hz');
    }

    actions.push('Verificar posición de wedges respecto a micrófono');
    actions.push('Revisar polaridad entre wedge y micrófono');
    actions.push('Considerar ring-out de monitores');

    if (severity === FeedbackSeverity.HIGH || severity === FeedbackSeverity.CRITICAL) {
      actions.push('Reducir nivel general de monitor mix');
      actions.push('Sugerir IEMs si feedback persiste');
    }

    return actions;
  }

  private getMonitorsTechnical(event: FeedbackEvent, freqLabel: string): string {
    return `Monitor feedback: ${event.frequency.toFixed(1)} Hz (${freqLabel}) | ` +
           `Nivel: ${event.magnitudeDb.toFixed(1)} dB | ` +
           `Q: ${event.qFactor.toFixed(1)} | ` +
           `Duración: ${event.duration.toFixed(0)} ms`;
  }

  private getBroadcastPrimaryAction(freq: number, severity: FeedbackSeverity, qFactor: number): string {
    if (severity === FeedbackSeverity.CRITICAL) {
      return `ALERTA BROADCAST: Atenuar ${freq.toFixed(0)} Hz inmediatamente en EQ de línea`;
    }

    return `Aplicar notch filter -${this.getSuggestedCutDb(severity)} dB en ${freq.toFixed(0)} Hz (Q=${qFactor.toFixed(1)}) en cadena broadcast`;
  }

  private getBroadcastSecondaryActions(freq: number, severity: FeedbackSeverity): string[] {
    const actions = [];

    actions.push('Revisar ganancia de aux/matrix hacia broadcast');
    actions.push('Verificar que EQ de broadcast sea post-fader');
    actions.push('Considerar limitador en cadena broadcast');
    
    if (freq < 150) {
      actions.push('Activar rumble filter (high-pass) en broadcast feed');
    }

    if (severity === FeedbackSeverity.CRITICAL) {
      actions.push('Notificar a director técnico/productor');
      actions.push('Considerar delay en feed para aplicar corrección');
    }

    return actions;
  }

  private getBroadcastTechnical(event: FeedbackEvent, freqLabel: string): string {
    return `Broadcast issue: ${event.frequency.toFixed(1)} Hz (${freqLabel}) | ` +
           `Peak: ${event.magnitudeDb.toFixed(1)} dB | ` +
           `Q-Factor: ${event.qFactor.toFixed(1)} | ` +
           `Severidad: ${event.severity.toUpperCase()}`;
  }

  private getRecordingPrimaryAction(freq: number, severity: FeedbackSeverity, qFactor: number): string {
    if (severity === FeedbackSeverity.CRITICAL) {
      return `CRÍTICO RECORDING: Detener take y corregir ${freq.toFixed(0)} Hz antes de continuar`;
    }

    return `Anotar ${freq.toFixed(0)} Hz para corrección en post-producción (Q=${qFactor.toFixed(1)})`;
  }

  private getRecordingSecondaryActions(freq: number, severity: FeedbackSeverity): string[] {
    const actions = [];

    if (severity === FeedbackSeverity.HIGH || severity === FeedbackSeverity.CRITICAL) {
      actions.push('Detener grabación si feedback contamina take');
      actions.push('Aplicar corrección en real-time si es posible');
    } else {
      actions.push('Marcar timestamp para edición posterior');
      actions.push('Continuar con take si no es disruptivo');
    }

    actions.push('Revisar niveles de room mics/ambient mics');
    actions.push('Considerar eliminación con RX o similar en post');

    return actions;
  }

  private getRecordingTechnical(event: FeedbackEvent, freqLabel: string): string {
    return `Recording contamination: ${event.frequency.toFixed(1)} Hz (${freqLabel}) | ` +
           `Magnitude: ${event.magnitudeDb.toFixed(1)} dB | ` +
           `Duration: ${event.duration.toFixed(0)} ms | ` +
           `Q: ${event.qFactor.toFixed(1)}`;
  }

  private getSuggestedCutDb(severity: FeedbackSeverity): number {
    switch (severity) {
      case FeedbackSeverity.CRITICAL: return 12;
      case FeedbackSeverity.HIGH: return 8;
      case FeedbackSeverity.MEDIUM: return 5;
      case FeedbackSeverity.LOW: return 3;
    }
  }

  private getFrequencyLabel(freq: number): string {
    if (freq < 60) return 'Sub-bass';
    if (freq < 250) return 'Bass';
    if (freq < 500) return 'Low-mid';
    if (freq < 2000) return 'Mid';
    if (freq < 4000) return 'Upper-mid';
    if (freq < 8000) return 'Presence';
    return 'Brilliance';
  }
}
