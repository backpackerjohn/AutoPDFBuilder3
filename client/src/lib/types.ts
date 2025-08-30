export interface UploadedFile {
  file: File;
  preview: string;
  documentType: string;
}

export interface ProcessingStatus {
  isProcessing: boolean;
  currentStep: string;
  progress: number;
}

export interface ReviewField {
  key: string;
  label: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface GeneratedDocument {
  template: string;
  fileName: string;
  downloadUrl: string;
  fieldsProcessed: number;
  fieldsTotal: number;
}
