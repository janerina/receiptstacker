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
  dateTime?: string;
  storeAddress?: string;
  storeNumber?: string;
  cashierName?: string;
  paymentMethod?: string;
  totalItems?: number;
  // Optional structured extraction (best-effort).
  items?: Array<{
    name: string;
    quantity?: number;
    unitPrice?: number;
    totalPrice: number;
    confidence?: number;
  }>;
  subtotal?: string;
  tax?: string;
  categoryId?: string;
  category?: string;
};

export type OcrBoundingBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type OcrWord = {
  text: string;
  confidence?: number;
  boundingBox?: OcrBoundingBox;
};

export type OcrLine = {
  text: string;
  words: OcrWord[];
  confidence?: number;
  boundingBox?: OcrBoundingBox;
};

export type OcrLayout = {
  lines: OcrLine[];
};

export type OcrResult = {
  text: string;
  rawResultJson?: string;
  engine: 'mlkit';
  processingTimeMs: number;
  confidence?: number;
  layout?: OcrLayout;
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
