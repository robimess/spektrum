import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonList, IonToggle, IonIcon,
  IonRadioGroup, IonRadio, IonRange, ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline, resizeOutline, pauseOutline, colorPaletteOutline,
  contrastOutline, volumeHighOutline, colorWandOutline
} from 'ionicons/icons';

export interface SettingsResult {
  resolution: string;
  holdMs: number;
  palette: string;
  gamma: number;
  feedbackThresholdDb: number;
  feedbackMinDurationMs: number;
  feedbackMinFreq: number;
  feedbackMaxFreq: number;
  userRole: string;
  theme: string;
  useColor: boolean;
  showGrid: boolean;
  calibrationEnabled: boolean;
  calibrationScope: string;
}

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonList, IonToggle, IonIcon,
    IonRadioGroup, IonRadio, IonRange
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Ajustes</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="dismiss()">
            <ion-icon name="close-outline" slot="icon-only"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2 class="section-title">Vista</h2>
      <ion-list>
        <ion-item>
          <ion-icon name="resize-outline" slot="start"></ion-icon>
          <ion-label>Resolución</ion-label>
        </ion-item>
        <ion-radio-group [value]="resolution" (ionChange)="resolution = $any($event.detail.value)">
          <ion-item><ion-label>Octava</ion-label><ion-radio value="octava"></ion-radio></ion-item>
          <ion-item><ion-label>1/2 octava</ion-label><ion-radio value="media"></ion-radio></ion-item>
          <ion-item><ion-label>1/3 octava</ion-label><ion-radio value="tercio"></ion-radio></ion-item>
        </ion-radio-group>

        <ion-item>
          <ion-icon name="pause-outline" slot="start"></ion-icon>
          <ion-label>HOLD</ion-label>
        </ion-item>
        <ion-radio-group [value]="holdMs" (ionChange)="holdMs = +$any($event.detail.value)">
          <ion-item><ion-label>Off</ion-label><ion-radio [value]="0"></ion-radio></ion-item>
          <ion-item><ion-label>0.5 s</ion-label><ion-radio [value]="500"></ion-radio></ion-item>
          <ion-item><ion-label>1 s</ion-label><ion-radio [value]="1000"></ion-radio></ion-item>
          <ion-item><ion-label>2 s</ion-label><ion-radio [value]="2000"></ion-radio></ion-item>
          <ion-item><ion-label>Infinito</ion-label><ion-radio [value]="999999"></ion-radio></ion-item>
        </ion-radio-group>

        <ion-item>
          <ion-icon name="color-palette-outline" slot="start"></ion-icon>
          <ion-label>Paleta</ion-label>
        </ion-item>
        <ion-radio-group [value]="palette" (ionChange)="palette = $any($event.detail.value)">
          <ion-item><ion-label>viridis</ion-label><ion-radio value="viridis"></ion-radio></ion-item>
          <ion-item><ion-label>magma</ion-label><ion-radio value="magma"></ion-radio></ion-item>
          <ion-item><ion-label>inferno</ion-label><ion-radio value="inferno"></ion-radio></ion-item>
          <ion-item><ion-label>plasma</ion-label><ion-radio value="plasma"></ion-radio></ion-item>
          <ion-item><ion-label>gray</ion-label><ion-radio value="gray"></ion-radio></ion-item>
        </ion-radio-group>

        <ion-item>
          <ion-icon name="contrast-outline" slot="start"></ion-icon>
          <ion-label>Gamma: {{ gamma.toFixed(1) }}</ion-label>
        </ion-item>
        <ion-item>
          <ion-range [min]="0.5" [max]="2.5" [step]="0.1" [value]="gamma"
                     (ionChange)="gamma = $any($event.detail.value)"></ion-range>
        </ion-item>

        <ion-item>
          <ion-label>Color</ion-label>
          <ion-toggle slot="end" [checked]="useColor" (ionChange)="useColor = $any($event.detail.checked)"></ion-toggle>
        </ion-item>
        <ion-item>
          <ion-label>Grilla</ion-label>
          <ion-toggle slot="end" [checked]="showGrid" (ionChange)="showGrid = $any($event.detail.checked)"></ion-toggle>
        </ion-item>
      </ion-list>

      <h2 class="section-title">Detector</h2>
      <ion-list>
        <ion-item>
          <ion-icon name="volume-high-outline" slot="start"></ion-icon>
          <ion-label>Sensibilidad: +{{ feedbackThresholdDb }} dB</ion-label>
        </ion-item>
        <ion-item>
          <ion-range [min]="6" [max]="40" [step]="1" [value]="feedbackThresholdDb"
                     (ionChange)="feedbackThresholdDb = $any($event.detail.value)"></ion-range>
        </ion-item>

        <ion-item>
          <ion-label>Duración mínima</ion-label>
        </ion-item>
        <ion-radio-group [value]="feedbackMinDurationMs" (ionChange)="feedbackMinDurationMs = +$any($event.detail.value)">
          <ion-item><ion-label>0.6 s</ion-label><ion-radio [value]="600"></ion-radio></ion-item>
          <ion-item><ion-label>1.0 s</ion-label><ion-radio [value]="1000"></ion-radio></ion-item>
          <ion-item><ion-label>1.5 s</ion-label><ion-radio [value]="1500"></ion-radio></ion-item>
          <ion-item><ion-label>2.0 s</ion-label><ion-radio [value]="2000"></ion-radio></ion-item>
          <ion-item><ion-label>3.0 s</ion-label><ion-radio [value]="3000"></ion-radio></ion-item>
        </ion-radio-group>

        <ion-item>
          <ion-label>Rol IA</ion-label>
        </ion-item>
        <ion-radio-group [value]="userRole" (ionChange)="userRole = $any($event.detail.value)">
          <ion-item><ion-label>FOH</ion-label><ion-radio value="foh"></ion-radio></ion-item>
          <ion-item><ion-label>Monitores</ion-label><ion-radio value="monitors"></ion-radio></ion-item>
          <ion-item><ion-label>Broadcast</ion-label><ion-radio value="broadcast"></ion-radio></ion-item>
          <ion-item><ion-label>Recording</ion-label><ion-radio value="recording"></ion-radio></ion-item>
        </ion-radio-group>
      </ion-list>

      <h2 class="section-title">Calibración</h2>
      <ion-list>
        <ion-item>
          <ion-label>Compensación</ion-label>
          <ion-toggle slot="end" [checked]="calibrationEnabled" (ionChange)="calibrationEnabled = $any($event.detail.checked)"></ion-toggle>
        </ion-item>
      </ion-list>

      <h2 class="section-title">Apariencia</h2>
      <ion-list>
        <ion-item>
          <ion-icon name="color-wand-outline" slot="start"></ion-icon>
          <ion-label>Tema</ion-label>
        </ion-item>
        <ion-radio-group [value]="theme" (ionChange)="theme = $any($event.detail.value)">
          <ion-item><ion-label>Oscuro</ion-label><ion-radio value="dark"></ion-radio></ion-item>
          <ion-item><ion-label>Claro</ion-label><ion-radio value="light"></ion-radio></ion-item>
        </ion-radio-group>
      </ion-list>

      <div class="ion-padding">
        <ion-button expand="block" color="primary" (click)="applyAndClose()">
          Aplicar y cerrar
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    .section-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--sp-muted, #8A9AA3);
      margin: 16px 16px 4px;
    }
    ion-list {
      margin-bottom: 4px;
    }
  `]
})
export class SettingsModalComponent {
  private readonly modalCtrl = inject(ModalController);

  resolution = 'tercio';
  holdMs = 1000;
  palette = 'viridis';
  gamma = 1.2;
  feedbackThresholdDb = 16;
  feedbackMinDurationMs = 1000;
  feedbackMinFreq = 250;
  feedbackMaxFreq = 18000;
  userRole = 'foh';
  theme = 'dark';
  useColor = true;
  showGrid = false;
  calibrationEnabled = true;
  calibrationScope = 'device';

  constructor() {
    addIcons({
      closeOutline, resizeOutline, pauseOutline, colorPaletteOutline,
      contrastOutline, volumeHighOutline, colorWandOutline
    });
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  applyAndClose() {
    this.modalCtrl.dismiss({
      resolution: this.resolution,
      holdMs: this.holdMs,
      palette: this.palette,
      gamma: this.gamma,
      feedbackThresholdDb: this.feedbackThresholdDb,
      feedbackMinDurationMs: this.feedbackMinDurationMs,
      feedbackMinFreq: this.feedbackMinFreq,
      feedbackMaxFreq: this.feedbackMaxFreq,
      userRole: this.userRole,
      theme: this.theme,
      useColor: this.useColor,
      showGrid: this.showGrid,
      calibrationEnabled: this.calibrationEnabled,
      calibrationScope: this.calibrationScope,
    } as SettingsResult, 'apply');
  }
}
