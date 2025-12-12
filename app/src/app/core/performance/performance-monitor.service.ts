import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface PerformanceMetrics {
  readonly fps: number;
  readonly frameTime: number;
  readonly audioLatency: number;
  readonly cpuUsage: number;
  readonly memoryUsage: number;
  readonly droppedFrames: number;
  readonly timestamp: number;
}

export interface PerformanceStats {
  readonly avgFps: number;
  readonly minFps: number;
  readonly maxFps: number;
  readonly avgLatency: number;
  readonly avgCpuUsage: number;
  readonly avgMemoryMb: number;
  readonly totalDroppedFrames: number;
}

@Injectable({ providedIn: 'root' })
export class PerformanceMonitorService {
  private metricsSubject = new BehaviorSubject<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    audioLatency: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    droppedFrames: 0,
    timestamp: 0
  });

  private frameHistory: number[] = [];
  private latencyHistory: number[] = [];
  private cpuHistory: number[] = [];
  private memoryHistory: number[] = [];
  
  private lastFrameTime = 0;
  private frameCount = 0;
  private droppedFrameCount = 0;
  private rafId: number | null = null;

  private readonly HISTORY_SIZE = 60;
  private readonly TARGET_FPS = 60;
  private readonly FRAME_DROP_THRESHOLD = 50;

  get metrics$(): Observable<PerformanceMetrics> {
    return this.metricsSubject.asObservable();
  }

  startMonitoring(): void {
    if (this.rafId !== null) return;

    this.lastFrameTime = performance.now();
    this.measureFrame();
  }

  stopMonitoring(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  recordAudioLatency(latencyMs: number): void {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.HISTORY_SIZE) {
      this.latencyHistory.shift();
    }
  }

  getStats(): PerformanceStats {
    const fps = this.frameHistory.length > 0 
      ? this.frameHistory 
      : [0];

    return {
      avgFps: this.average(fps),
      minFps: Math.min(...fps),
      maxFps: Math.max(...fps),
      avgLatency: this.average(this.latencyHistory),
      avgCpuUsage: this.average(this.cpuHistory),
      avgMemoryMb: this.average(this.memoryHistory),
      totalDroppedFrames: this.droppedFrameCount
    };
  }

  reset(): void {
    this.frameHistory = [];
    this.latencyHistory = [];
    this.cpuHistory = [];
    this.memoryHistory = [];
    this.droppedFrameCount = 0;
    this.frameCount = 0;
  }

  private measureFrame = (): void => {
    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;

    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;
    
    if (fps < this.FRAME_DROP_THRESHOLD && this.frameCount > 10) {
      this.droppedFrameCount++;
    }

    this.frameHistory.push(fps);
    if (this.frameHistory.length > this.HISTORY_SIZE) {
      this.frameHistory.shift();
    }

    const cpuUsage = this.estimateCpuUsage(deltaTime);
    this.cpuHistory.push(cpuUsage);
    if (this.cpuHistory.length > this.HISTORY_SIZE) {
      this.cpuHistory.shift();
    }

    const memoryUsage = this.getMemoryUsage();
    this.memoryHistory.push(memoryUsage);
    if (this.memoryHistory.length > this.HISTORY_SIZE) {
      this.memoryHistory.shift();
    }

    const avgLatency = this.latencyHistory.length > 0
      ? this.average(this.latencyHistory)
      : 0;

    this.metricsSubject.next({
      fps: Math.round(fps),
      frameTime: deltaTime,
      audioLatency: avgLatency,
      cpuUsage,
      memoryUsage,
      droppedFrames: this.droppedFrameCount,
      timestamp: now
    });

    this.lastFrameTime = now;
    this.frameCount++;

    this.rafId = requestAnimationFrame(this.measureFrame);
  };

  private estimateCpuUsage(deltaTime: number): number {
    const idealFrameTime = 1000 / this.TARGET_FPS;
    const usage = (deltaTime / idealFrameTime) * 100;
    return Math.min(Math.max(usage, 0), 100);
  }

  private getMemoryUsage(): number {
    if ('memory' in performance) {
      const perfMemory = (performance as any).memory;
      if (perfMemory && 'usedJSHeapSize' in perfMemory) {
        return perfMemory.usedJSHeapSize / (1024 * 1024);
      }
    }
    return 0;
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }
}
