import AsyncStorage from '@react-native-async-storage/async-storage';

export type ReportFormat = 'pdf' | 'csv' | 'excel';
export type ReportType = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface StoredReport {
  id: string;
  name: string;
  format: ReportFormat;
  type: ReportType;
  rangeStart: string; // ISO
  rangeEnd: string; // ISO
  filePath: string; // absolute path or file://
  sizeBytes: number;
  createdAt: string; // ISO
}

const STORAGE_KEY = 'receiptstacker.reports' as const;

type StoredState = {
  reports: StoredReport[];
};

const readState = async (): Promise<StoredState> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return { reports: [] };

  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    return { reports: Array.isArray(parsed.reports) ? (parsed.reports as StoredReport[]) : [] };
  } catch {
    return { reports: [] };
  }
};

const writeState = async (state: StoredState): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const listReports = async (): Promise<StoredReport[]> => {
  const state = await readState();
  return state.reports;
};

export const upsertReport = async (report: StoredReport): Promise<void> => {
  const state = await readState();
  const idx = state.reports.findIndex(r => r.id === report.id);
  const next = [...state.reports];

  if (idx >= 0) {
    next[idx] = report;
  } else {
    next.unshift(report);
  }

  await writeState({ reports: next });
};

export const deleteReportById = async (id: string): Promise<void> => {
  const state = await readState();
  const next = state.reports.filter(r => r.id !== id);
  await writeState({ reports: next });
};
