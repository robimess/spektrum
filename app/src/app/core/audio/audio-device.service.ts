import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface AudioDevice {
  readonly id: string;
  readonly label: string;
  readonly kind: MediaDeviceKind;
  readonly groupId: string;
}

@Injectable({ providedIn: 'root' })
export class AudioDeviceService {
  private devicesSubject = new BehaviorSubject<AudioDevice[]>([]);
  private selectedDeviceSubject = new BehaviorSubject<string | null>(null);
  private errorSubject = new Subject<Error>();

  public readonly devices$ = this.devicesSubject.asObservable();
  public readonly selectedDevice$ = this.selectedDeviceSubject.asObservable();
  public readonly errors$ = this.errorSubject.asObservable();

  private mediaStream: MediaStream | null = null;

  async initialize(): Promise<void> {
    try {
      await this.requestPermission();
      await this.enumerateDevices();
      this.setupDeviceChangeListener();
    } catch (error) {
      this.errorSubject.next(error as Error);
      throw error;
    }
  }

  async requestPermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      });
      
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      throw new Error('Microphone permission denied');
    }
  }

  async enumerateDevices(): Promise<AudioDevice[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.substring(0, 8)}`,
          kind: d.kind,
          groupId: d.groupId,
        }));

      this.devicesSubject.next(audioInputs);
      
      if (audioInputs.length > 0 && !this.selectedDeviceSubject.value) {
        this.selectedDeviceSubject.next(audioInputs[0].id);
      }

      return audioInputs;
    } catch (error) {
      this.errorSubject.next(error as Error);
      return [];
    }
  }

  selectDevice(deviceId: string): void {
    const devices = this.devicesSubject.value;
    if (devices.some(d => d.id === deviceId)) {
      this.selectedDeviceSubject.next(deviceId);
    }
  }

  getSelectedDevice(): string | null {
    return this.selectedDeviceSubject.value;
  }

  async createMediaStream(deviceId?: string): Promise<MediaStream> {
    const targetDeviceId = deviceId || this.selectedDeviceSubject.value;
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: targetDeviceId ? { exact: targetDeviceId } : undefined,
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      return this.mediaStream;
    } catch (error) {
      this.errorSubject.next(error as Error);
      throw error;
    }
  }

  private setupDeviceChangeListener(): void {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      this.enumerateDevices();
    });
  }

  destroy(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }
}
