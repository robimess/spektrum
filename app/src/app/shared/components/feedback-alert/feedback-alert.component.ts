import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { FeedbackDetectorService } from '../../services/feedback-detector.service';
import { FeedbackLogService } from '../../services/feedback-log.service';
import { AiSuggestionsService, Suggestion } from '../../services/ai-suggestions.service';
import { FeedbackEvent } from '../../models/feedback-event.model';

@Component({
  selector: 'app-feedback-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './feedback-alert.component.html',
  styleUrls: ['./feedback-alert.component.scss'],
})
export class FeedbackAlertComponent implements OnInit, OnDestroy {
  activeEvents: FeedbackEvent[] = [];
  currentSuggestion: Suggestion | null = null;
  
  private subs = new Subscription();
  private loggedEvents = new Set<string>();

  constructor(
    private feedbackDetector: FeedbackDetectorService,
    private feedbackLog: FeedbackLogService,
    private aiSuggestions: AiSuggestionsService
  ) {}

  ngOnInit() {
    this.subs.add(
      this.feedbackDetector.events$.subscribe(events => {
        this.activeEvents = events.filter(e => e.isActive);
        
        events
          .filter(e => !e.isActive && !this.loggedEvents.has(e.id))
          .forEach(e => {
            this.feedbackLog.addEvent(e);
            this.loggedEvents.add(e.id);
          });

        if (this.activeEvents.length > 0) {
          this.aiSuggestions.generateSuggestion(this.activeEvents);
        }
      })
    );

    this.subs.add(
      this.aiSuggestions.suggestions$.subscribe(sug => {
        this.currentSuggestion = sug;
        setTimeout(() => {
          if (this.currentSuggestion?.id === sug.id) {
            this.currentSuggestion = null;
          }
        }, 8000);
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
  }

  dismiss() {
    this.currentSuggestion = null;
  }

  formatFreq(freq: number): string {
    return freq >= 1000 
      ? `${(freq / 1000).toFixed(1)} kHz` 
      : `${Math.round(freq)} Hz`;
  }
}
