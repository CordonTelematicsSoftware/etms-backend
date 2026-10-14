export interface ErrorMessage {
  [key: string]: string;
}

export interface UniqueValidationError {
  fieldName: string;
  error: boolean;
  customMessage?: string;
}
