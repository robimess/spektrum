import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MicDevice {
  id: string;
  label: string;
}

@Component({
  selector: 'app-mic-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mic-selector.component.html',
  styleUrls: ['./mic-selector.component.scss'],
})
export class MicSelectorComponent implements OnInit {
  @Output() deviceSelected = new EventEmitter<string>();

  devices: MicDevice[] = [];
  selectedId: string | null = null;
  loading = true;

  async ngOnInit() {
    await this.loadDevices();
  }

  async loadDevices() {
    this.loading = true;
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
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
      console.error('Error al cargar dispositivos de audio:', error);
    } finally {
      this.loading = false;
    }
  }

  selectDevice(id: string) {
    this.selectedId = id;
    this.deviceSelected.emit(id);
  }
}
