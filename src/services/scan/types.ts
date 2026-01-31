export type ScanMode = 'single' | 'multi' | 'long';

export type CapturedImage = {
  id: string;
  uri: string;
  width?: number;
  height?: number;
  createdAt: number;
  order: number;
};

export type OcrExtractedData = {
  merchant?: string;
  amount?: string;
  date?: string;
};

export type OcrResult = {
  text: string;
  rawResultJson?: string;
  engine: 'mlkit';
  processingTimeMs: number;
  confidence?: number;
  extracted?: OcrExtractedData;
};

export type ScanSession = {
  id: string;
  mode: ScanMode;
  images: CapturedImage[];
  createdAt: number;
};

export type ScanSessionResultItem = {
  image: CapturedImage;
  ocr: OcrResult;
};

export type ScanSessionResult = {
  session: ScanSession;
  results: ScanSessionResultItem[];
};
