import type { ScanSessionResult } from './types';

let lastSessionResult: ScanSessionResult | null = null;

export const setLastScanSessionResult = (result: ScanSessionResult | null) => {
  lastSessionResult = result;
};

export const getLastScanSessionResult = (): ScanSessionResult | null => lastSessionResult;
