import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { warningOutline, bulbOutline, closeOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { FeedbackDetectorService } from '../../services/feedback-detector.service';
import { FeedbackLogService } from '../../services/feedback-log.service';
import { AiSuggestionsService, Suggestion } from '../../services/ai-suggestions.service';
import { FeedbackEvent, feedbackEventKeyFromFrequency } from '../../models/feedback-event.model';

@Component({
  selector: 'app-feedback-alert',
  standalone: true,
  imports: [CommonModule, IonIcon, IonButton],
  templateUrl: './feedback-alert.component.html',
  styleUrls: ['./feedback-alert.component.scss'],
})
export class FeedbackAlertComponent implements OnInit, OnDestroy {
  private readonly feedbackDetector = inject(FeedbackDetectorService);
  private readonly feedbackLog = inject(FeedbackLogService);
  private readonly aiSuggestions = inject(AiSuggestionsService);

  activeEvents: FeedbackEvent[] = [];
  primaryEvent: FeedbackEvent | null = null;
  extraActiveCount = 0;
  currentSuggestion: Suggestion | null = null;
  warningStale = false;
  readonly Math = Math;
  
  private subs = new Subscription();
  private loggedEvents = new Set<string>();

  constructor() {
    addIcons({ warningOutline, bulbOutline, closeOutline });
  }
  private lastSuggestionAt = 0;
  private lastSuggestedEventKey: string | null = null;
  private lastSuggestedFreq = 0;
  private lastSuggestedDb = -Infinity;
  private dismissedSuggestionForEventKey: string | null = null;
  private readonly suggestionRefreshMs = 10_000;
  private lastPrimarySeenAt = 0;
  private warningVisibleSince = 0;
  private pendingPrimaryEvent: FeedbackEvent | null = null;
  private pendingPrimarySince = 0;
  private readonly warningArmMs = 140;
  private readonly warningHideGraceMs = 1100;
  private readonly warningMinVisibleMs = 1200;
  private readonly primarySwitchMarginDb = 2.2;
  private readonly primaryLockHz = 45;
  private readonly hardEventFreqDeltaHz = 35;
  private readonly minLogDurationMs = 300;
  private readonly maxLoggedEventsSize = 500;

  ngOnInit() {
    this.subs.add(
      this.feedbackDetector.events$.subscribe(events => {
        const now = Date.now();
        this.activeEvents = events
          .filter(e => e.isActive)
          .sort((a, b) => b.magnitudeDb - a.magnitudeDb);

        if (this.activeEvents.length > 0) {
          const nextPrimary = this.pickPrimaryEvent(this.activeEvents);
          this.extraActiveCount = Math.max(0, this.activeEvents.length - 1);
          this.lastPrimarySeenAt = now;

          if (!this.primaryEvent) {
            this.armPrimary(nextPrimary, now);
          } else {
            this.primaryEvent = nextPrimary;
            if (this.warningVisibleSince === 0) this.warningVisibleSince = now;
            this.pendingPrimaryEvent = null;
            this.pendingPrimarySince = 0;
            this.warningStale = false;
          }
        } else {
          this.extraActiveCount = 0;
          this.pendingPrimaryEvent = null;
          this.pendingPrimarySince = 0;

          if (!this.primaryEvent) {
            this.warningStale = false;
          } else {
            const inactiveForMs = now - this.lastPrimarySeenAt;
            const visibleForMs = now - this.warningVisibleSince;
            const canHide = inactiveForMs > this.warningHideGraceMs && visibleForMs >= this.warningMinVisibleMs;

            if (canHide) {
              this.primaryEvent = null;
              this.warningVisibleSince = 0;
              this.warningStale = false;
            } else {
              this.warningStale = true;
            }
          }
        }
        
        events
          .filter(e => !e.isActive && e.duration >= this.minLogDurationMs)
          .forEach(e => {
            if (this.loggedEvents.has(e.id)) return;
            this.feedbackLog.addEvent(e);
            this.loggedEvents.add(e.id);
          });

        if (this.loggedEvents.size > this.maxLoggedEventsSize) {
          const activeIds = new Set(this.activeEvents.map(e => e.id));
          for (const id of this.loggedEvents) {
            if (!activeIds.has(id)) this.loggedEvents.delete(id);
            if (this.loggedEvents.size <= this.maxLoggedEventsSize / 2) break;
          }
        }

        if (!this.primaryEvent) {
          this.currentSuggestion = null;
          this.lastSuggestedEventKey = null;
          this.dismissedSuggestionForEventKey = null;
          return;
        }

        if (this.activeEvents.length === 0) {
          return;
        }

        const primaryKey = this.eventKey(this.primaryEvent);

        if (this.dismissedSuggestionForEventKey && this.dismissedSuggestionForEventKey !== primaryKey) {
          this.dismissedSuggestionForEventKey = null;
        }

        if (this.dismissedSuggestionForEventKey === primaryKey) {
          return;
        }

        const keyChanged = primaryKey !== this.lastSuggestedEventKey;
        const freqJumped = Math.abs(this.primaryEvent.frequency - this.lastSuggestedFreq) >= this.hardEventFreqDeltaHz;
        const eventChanged = keyChanged && freqJumped;
        const freqChanged = Math.abs(this.primaryEvent.frequency - this.lastSuggestedFreq) >= 12;
        const dbChanged = Math.abs(this.primaryEvent.magnitudeDb - this.lastSuggestedDb) >= 0.8;
        const due = (now - this.lastSuggestionAt) >= this.suggestionRefreshMs;

        if (eventChanged || ((freqChanged || dbChanged) && due) || (due && this.currentSuggestion)) {
          this.aiSuggestions.generateSuggestion([this.primaryEvent]);
          this.lastSuggestionAt = now;
          this.lastSuggestedEventKey = primaryKey;
          this.lastSuggestedFreq = this.primaryEvent.frequency;
          this.lastSuggestedDb = this.primaryEvent.magnitudeDb;
        }
      })
    );

    this.subs.add(
      this.aiSuggestions.suggestions$.subscribe(sug => {
        this.currentSuggestion = sug;
      })
    );
  }

  ngOnDestroy() {
    this.loggedEvents.clear();
    this.subs.unsubscribe();
  }

  dismiss() {
    if (this.primaryEvent) {
      this.dismissedSuggestionForEventKey = this.eventKey(this.primaryEvent);
    }
    this.currentSuggestion = null;
  }

  private pickPrimaryEvent(sortedActiveEvents: FeedbackEvent[]): FeedbackEvent {
    const strongest = sortedActiveEvents[0];
    if (!this.primaryEvent) return strongest;

    const currentKey = this.eventKey(this.primaryEvent);
    const currentById = sortedActiveEvents.find(e => this.eventKey(e) === currentKey);
    if (currentById) {
      if ((strongest.magnitudeDb - currentById.magnitudeDb) < this.primarySwitchMarginDb) {
        return currentById;
      }
      return strongest;
    }

    const nearby = sortedActiveEvents.find(
      e => Math.abs(e.frequency - this.primaryEvent!.frequency) <= this.primaryLockHz
    );
    if (nearby && (strongest.magnitudeDb - nearby.magnitudeDb) < this.primarySwitchMarginDb) {
      return nearby;
    }

    return strongest;
  }

  private eventKey(event: FeedbackEvent): string {
    return event.eventKey || feedbackEventKeyFromFrequency(event.frequency);
  }

  private armPrimary(candidate: FeedbackEvent, now: number): void {
    const samePending = this.pendingPrimaryEvent !== null &&
      Math.abs(this.pendingPrimaryEvent.frequency - candidate.frequency) <= this.primaryLockHz;

    if (!samePending) {
      this.pendingPrimaryEvent = candidate;
      this.pendingPrimarySince = now;
      return;
    }

    this.pendingPrimaryEvent = candidate;
    if ((now - this.pendingPrimarySince) < this.warningArmMs) return;

    this.primaryEvent = candidate;
    this.warningVisibleSince = now;
    this.warningStale = false;
    this.pendingPrimaryEvent = null;
    this.pendingPrimarySince = 0;
  }

  formatFreq(freq: number): string {
    return freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${Math.round(freq)} Hz`;
  }

  formatPositiveDb(value?: number): string {
    return `${Math.max(0, value ?? 0).toFixed(1)} dB`;
  }
}
