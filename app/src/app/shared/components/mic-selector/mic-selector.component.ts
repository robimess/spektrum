import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonItem, IonLabel, IonSelect, IonSelectOption, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { micOutline } from 'ionicons/icons';
import { DEFAULT_AUDIO_CAPTURE_PREFERENCES, buildAudioConstraintAttempts } from '../../../core/audio/audio-capture.util';

export interface MicDevice {
  id: string;
  label: string;
}

@Component({
  selector: 'app-mic-selector',
  standalone: true,
  imports: [CommonModule, IonItem, IonLabel, IonSelect, IonSelectOption, IonIcon, IonSpinner],
  templateUrl: './mic-selector.component.html',
  styleUrls: ['./mic-selector.component.scss'],
})
export class MicSelectorComponent implements OnInit {
  @Output() deviceSelected = new EventEmitter<string>();

  devices: MicDevice[] = [];
  selectedId: string | null = null;
  loading = true;
  errorMessage = '';

  constructor() {
    addIcons({ micOutline });
  }
  private readonly permissionConstraints = buildAudioConstraintAttempts(DEFAULT_AUDIO_CAPTURE_PREFERENCES)[0]?.constraints ?? {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  async ngOnInit() {
    await this.loadDevices();
  }

  async loadDevices() {
    this.loading = true;
    this.errorMessage = '';
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: this.permissionConstraints });
      permissionStream.getTracks().forEach(track => track.stop());
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.devices = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          label: d.label || `Micrófono ${d.deviceId.slice(0, 8)}`,
        }));

      if (this.devices.length > 0 && !this.selectedId) {
        this.selectedId = this.devices[0].id;
      }
    } catch (error) {
      this.devices = [];
      this.errorMessage = 'No fue posible enumerar micrófonos en este entorno.';
    } finally {
      this.loading = false;
    }
  }

  selectDevice(id: string) {
    this.selectedId = id;
    this.deviceSelected.emit(id);
  }
}
