import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonItem, IonLabel, IonSelect, IonSelectOption,
  IonRange, IonList, IonToggle, IonIcon, ModalController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';

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
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
    IonContent, IonItem, IonLabel, IonSelect, IonSelectOption,
    IonRange, IonList, IonToggle, IonIcon
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
      <ion-list lines="full">
        <ion-item>
          <ion-icon name="resize-outline" slot="start"></ion-icon>
          <ion-label>Resolución</ion-label>
          <ion-select interface="popover" [(ngModel)]="resolution">
            <ion-select-option value="octava">Octava</ion-select-option>
            <ion-select-option value="media">1/2 octava</ion-select-option>
            <ion-select-option value="tercio">1/3 octava</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-icon name="pause-outline" slot="start"></ion-icon>
          <ion-label>HOLD</ion-label>
          <ion-select interface="popover" [(ngModel)]="holdMs">
            <ion-select-option [value]="0">Off</ion-select-option>
            <ion-select-option [value]="500">0.5 s</ion-select-option>
            <ion-select-option [value]="1000">1 s</ion-select-option>
            <ion-select-option [value]="2000">2 s</ion-select-option>
            <ion-select-option [value]="999999">&infin;</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-icon name="color-palette-outline" slot="start"></ion-icon>
          <ion-label>Paleta</ion-label>
          <ion-select interface="popover" [(ngModel)]="palette">
            <ion-select-option value="viridis">viridis</ion-select-option>
            <ion-select-option value="magma">magma</ion-select-option>
            <ion-select-option value="inferno">inferno</ion-select-option>
            <ion-select-option value="plasma">plasma</ion-select-option>
            <ion-select-option value="gray">gray</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-icon name="contrast-outline" slot="start"></ion-icon>
          <ion-label>Gamma</ion-label>
          <ion-range [min]="0.5" [max]="2.5" [step]="0.1" [(ngModel)]="gamma">
            <ion-label slot="end" class="mono">{{ gamma.toFixed(1) }}</ion-label>
          </ion-range>
        </ion-item>

        <ion-item>
          <ion-label>Color</ion-label>
          <ion-toggle slot="end" [(ngModel)]="useColor"></ion-toggle>
        </ion-item>

        <ion-item>
          <ion-label>Grilla</ion-label>
          <ion-toggle slot="end" [(ngModel)]="showGrid"></ion-toggle>
        </ion-item>
      </ion-list>

      <ion-list lines="full" header="Detector">
        <ion-item>
          <ion-icon name="volume-high-outline" slot="start"></ion-icon>
          <ion-label>Sensibilidad</ion-label>
          <ion-range [min]="6" [max]="40" [step]="1" [(ngModel)]="feedbackThresholdDb">
            <ion-label slot="end" class="mono">+{{ feedbackThresholdDb }} dB</ion-label>
          </ion-range>
        </ion-item>

        <ion-item>
          <ion-label>Duración mínima</ion-label>
          <ion-select interface="popover" [(ngModel)]="feedbackMinDurationMs">
            <ion-select-option [value]="600">0.6 s</ion-select-option>
            <ion-select-option [value]="1000">1.0 s</ion-select-option>
            <ion-select-option [value]="1500">1.5 s</ion-select-option>
            <ion-select-option [value]="2000">2.0 s</ion-select-option>
            <ion-select-option [value]="3000">3.0 s</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>Rango mín. Hz</ion-label>
          <ion-select interface="popover" [(ngModel)]="feedbackMinFreq">
            <ion-select-option [value]="80">80 Hz</ion-select-option>
            <ion-select-option [value]="125">125 Hz</ion-select-option>
            <ion-select-option [value]="250">250 Hz</ion-select-option>
            <ion-select-option [value]="500">500 Hz</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>Rango máx. Hz</ion-label>
          <ion-select interface="popover" [(ngModel)]="feedbackMaxFreq">
            <ion-select-option [value]="8000">8 kHz</ion-select-option>
            <ion-select-option [value]="12000">12 kHz</ion-select-option>
            <ion-select-option [value]="16000">16 kHz</ion-select-option>
            <ion-select-option [value]="18000">18 kHz</ion-select-option>
            <ion-select-option [value]="20000">20 kHz</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>Rol IA</ion-label>
          <ion-select interface="popover" [(ngModel)]="userRole">
            <ion-select-option value="foh">FOH</ion-select-option>
            <ion-select-option value="monitors">Monitores</ion-select-option>
            <ion-select-option value="broadcast">Broadcast</ion-select-option>
            <ion-select-option value="recording">Recording</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list lines="full" header="Calibración">
        <ion-item>
          <ion-label>Compensación</ion-label>
          <ion-toggle slot="end" [(ngModel)]="calibrationEnabled"></ion-toggle>
        </ion-item>

        <ion-item>
          <ion-label>Alcance</ion-label>
          <ion-select interface="popover" [(ngModel)]="calibrationScope">
            <ion-select-option value="device">Micrófono actual</ion-select-option>
            <ion-select-option value="global">Global</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-list lines="full" header="Apariencia">
        <ion-item>
          <ion-icon name="color-wand-outline" slot="start"></ion-icon>
          <ion-label>Tema</ion-label>
          <ion-select interface="popover" [(ngModel)]="theme">
            <ion-select-option value="dark">Oscuro</ion-select-option>
            <ion-select-option value="light">Claro</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <div class="ion-padding">
        <ion-button expand="block" color="primary" (click)="applyAndClose()">
          Aplicar y cerrar
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [`
    .mono {
      font-family: var(--sp-font-mono, 'JetBrains Mono', Consolas, monospace);
      font-variant-numeric: tabular-nums;
    }
    ion-list {
      margin-bottom: 8px;
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
    addIcons({ closeOutline });
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
