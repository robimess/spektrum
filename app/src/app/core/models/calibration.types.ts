export interface CalibrationPoint {
  hz: number;
  db: number;
}

export interface CalibrationCurve {
  name: string;
  points: CalibrationPoint[];
  updatedAt: number;
}

export interface CalibrationStore {
  enabled: boolean;
  curvesByDevice: Record<string, CalibrationCurve>;
}
