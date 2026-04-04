import { Injectable } from '@angular/core';
import { STORAGE_KEYS } from '../constants/audio.constants';
import { CalibrationCurve, CalibrationPoint, CalibrationStore } from '../models/calibration.types';

@Injectable({ providedIn: 'root' })
export class DeviceCalibrationService {
  private readonly MAX_CAL_POINTS = 64;
  private readonly MIN_CAL_HZ = 10;
  private readonly MAX_CAL_HZ = 22_050;

  private activeDeviceId?: string;
  private enabled = true;
  private curvesByDevice: Record<string, CalibrationCurve> = {};

  private outputBuffer = new Float32Array(0);
  private gainCache = new Map<string, Float32Array>();

  constructor() {
    this.load();
  }

  setActiveDevice(deviceId?: string | null): void {
    const next = (deviceId ?? '').trim() || undefined;
    if (next === this.activeDeviceId) return;
    this.activeDeviceId = next;
  }

  getActiveDevice(): string | undefined {
    return this.activeDeviceId;
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.save();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  hasActiveCalibration(): boolean {
    return !!this.getActiveCurveInternal();
  }

  getActiveCurve(): CalibrationCurve | undefined {
    return this.getActiveCurveInternal();
  }

  getCurveForDevice(deviceId: string): CalibrationCurve | undefined {
    return this.curvesByDevice[deviceId];
  }

  getGlobalCurve(): CalibrationCurve | undefined {
    return this.curvesByDevice['*'];
  }

  setCurveForDevice(deviceId: string, curve: CalibrationCurve): void {
    const key = (deviceId || '').trim();
    if (!key) return;

    const normalized = this.normalizeCurve(curve);
    if (!normalized) return;

    this.curvesByDevice[key] = normalized;
    this.invalidateCache();
    this.save();
  }

  setGlobalCurve(curve: CalibrationCurve): void {
    const normalized = this.normalizeCurve(curve);
    if (!normalized) return;

    this.curvesByDevice['*'] = normalized;
    this.invalidateCache();
    this.save();
  }

  removeCurveForDevice(deviceId: string): void {
    const key = (deviceId || '').trim();
    if (!key || !this.curvesByDevice[key]) return;
    delete this.curvesByDevice[key];
    this.invalidateCache();
    this.save();
  }

  removeGlobalCurve(): void {
    this.removeCurveForDevice('*');
  }

  clearAllCurves(): void {
    this.curvesByDevice = {};
    this.invalidateCache();
    this.save();
  }

  listDevicesWithCalibration(): string[] {
    return Object.keys(this.curvesByDevice);
  }

  applyToSpectrum(magLin: Float32Array, sampleRate: number): Float32Array {
    if (!this.enabled) return magLin;

    const curve = this.getActiveCurveInternal();
    if (!curve || curve.points.length < 2) return magLin;

    const len = magLin.length;
    if (!len || sampleRate <= 0) return magLin;

    const gains = this.getGainVector(curve, len, sampleRate);
    if (this.outputBuffer.length !== len) {
      this.outputBuffer = new Float32Array(len);
    }

    for (let i = 0; i < len; i++) {
      const v = magLin[i] * gains[i];
      this.outputBuffer[i] = Number.isFinite(v) ? v : 0;
    }

    return this.outputBuffer;
  }

  private getActiveCurveInternal(): CalibrationCurve | undefined {
    if (this.activeDeviceId && this.curvesByDevice[this.activeDeviceId]) {
      return this.curvesByDevice[this.activeDeviceId];
    }
    return this.curvesByDevice['*'];
  }

  private getGainVector(curve: CalibrationCurve, len: number, sampleRate: number): Float32Array {
    const deviceKey = this.activeDeviceId ?? '*';
    const key = `${deviceKey}|${curve.updatedAt}|${sampleRate}|${len}`;
    const cached = this.gainCache.get(key);
    if (cached) return cached;

    const nyquist = sampleRate / 2;
    const binHz = nyquist / len;
    const gains = new Float32Array(len);
    const points = curve.points;
    const pointLogs = points.map(p => Math.log10(Math.max(1, p.hz)));
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    let seg = 1;

    for (let i = 0; i < len; i++) {
      const hz = Math.max(1, i * binHz);
      let compDb: number;

      if (hz <= firstPoint.hz) {
        compDb = firstPoint.db;
      } else if (hz >= lastPoint.hz) {
        compDb = lastPoint.db;
      } else {
        while (seg < points.length && hz > points[seg].hz) seg++;
        const a = points[seg - 1];
        const b = points[seg];
        const aLog = pointLogs[seg - 1];
        const bLog = pointLogs[seg];
        const hzLog = Math.log10(Math.max(1, hz));
        const tDen = Math.max(1e-9, bLog - aLog);
        const t = Math.max(0, Math.min(1, (hzLog - aLog) / tDen));
        compDb = a.db + (b.db - a.db) * t;
      }

      gains[i] = Math.pow(10, compDb / 20);
    }

    this.gainCache.set(key, gains);
    return gains;
  }

  private interpolateDb(points: CalibrationPoint[], hz: number): number {
    if (!points.length) return 0;
    if (points.length === 1) return points[0].db;

    if (hz <= points[0].hz) return points[0].db;
    const last = points[points.length - 1];
    if (hz >= last.hz) return last.db;

    const hzLog = Math.log10(Math.max(1, hz));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (hz > b.hz) continue;

      const aLog = Math.log10(Math.max(1, a.hz));
      const bLog = Math.log10(Math.max(1, b.hz));
      const tDen = Math.max(1e-9, bLog - aLog);
      const t = Math.max(0, Math.min(1, (hzLog - aLog) / tDen));
      return a.db + (b.db - a.db) * t;
    }

    return last.db;
  }

  private normalizeCurve(curve: CalibrationCurve): CalibrationCurve | null {
    if (!curve || !Array.isArray(curve.points)) return null;

    const cleaned = curve.points
      .filter(p =>
        Number.isFinite(p.hz) &&
        p.hz >= this.MIN_CAL_HZ &&
        p.hz <= this.MAX_CAL_HZ &&
        Number.isFinite(p.db)
      )
      .map(p => ({ hz: p.hz, db: p.db }))
      .sort((a, b) => a.hz - b.hz);

    if (cleaned.length < 2) return null;

    const dedup: CalibrationPoint[] = [];
    for (const point of cleaned) {
      const prev = dedup[dedup.length - 1];
      if (prev && Math.abs(prev.hz - point.hz) < 1e-6) {
        prev.db = point.db;
      } else {
        dedup.push({ hz: point.hz, db: point.db });
      }
    }

    if (dedup.length < 2) return null;
    const bounded = dedup.length > this.MAX_CAL_POINTS
      ? this.resampleLogCurve(dedup, this.MAX_CAL_POINTS)
      : dedup;

    return {
      name: (curve.name || 'Custom calibration').trim(),
      points: bounded,
      updatedAt: Number.isFinite(curve.updatedAt) ? curve.updatedAt : Date.now(),
    };
  }

  private resampleLogCurve(points: CalibrationPoint[], maxPoints: number): CalibrationPoint[] {
    if (points.length <= maxPoints) return points;
    const out: CalibrationPoint[] = [];
    const minHz = Math.max(1, points[0].hz);
    const maxHz = Math.max(minHz + 1e-6, points[points.length - 1].hz);
    const minLog = Math.log10(minHz);
    const maxLog = Math.log10(maxHz);

    for (let i = 0; i < maxPoints; i++) {
      const t = i / (maxPoints - 1);
      const hz = Math.pow(10, minLog + t * (maxLog - minLog));
      const db = this.interpolateDb(points, hz);
      out.push({
        hz: Number(hz.toFixed(3)),
        db: Number(db.toFixed(3)),
      });
    }

    out[0] = { ...points[0] };
    out[out.length - 1] = { ...points[points.length - 1] };
    return out;
  }

  private invalidateCache(): void {
    this.gainCache.clear();
  }

  private save(): void {
    const payload: CalibrationStore = {
      enabled: this.enabled,
      curvesByDevice: this.curvesByDevice,
    };

    try {
      localStorage.setItem(STORAGE_KEYS.CALIBRATION, JSON.stringify(payload));
    } catch (error) {
      console.warn('No se pudo guardar calibración', error);
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CALIBRATION);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<CalibrationStore>;
      this.enabled = parsed.enabled ?? true;

      const entries = Object.entries(parsed.curvesByDevice ?? {});
      for (const [deviceId, curve] of entries) {
        const normalized = this.normalizeCurve(curve as CalibrationCurve);
        if (normalized) this.curvesByDevice[deviceId] = normalized;
      }
    } catch (error) {
      console.warn('No se pudo cargar calibración', error);
      this.enabled = true;
      this.curvesByDevice = {};
    }
  }
}
