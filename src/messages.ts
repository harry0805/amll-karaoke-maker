import en from './locales/en.json';

export type MessageKey = keyof typeof en;
export type MessageValues = Record<string, string | number>;
export interface LocalizedMessage {
  key: MessageKey;
  values?: MessageValues;
}
export type DisplayMessage = string | LocalizedMessage;

// Keep message data in state. Translate at display time so existing messages
// also update when the user changes language. User content stays plain text.
export function message(key: MessageKey, values?: MessageValues): LocalizedMessage {
  return { key, values };
}

export class LocalizedError extends Error {
  readonly displayMessage: LocalizedMessage;

  constructor(key: MessageKey, values?: MessageValues, options?: ErrorOptions) {
    // Preserve readable English errors for logs, tests, and non-UI callers.
    super(
      en[key].replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? '')),
      options,
    );
    this.displayMessage = message(key, values);
  }
}

export function errorMessage(error: unknown): DisplayMessage {
  if (error instanceof LocalizedError) return error.displayMessage;
  if (error instanceof DOMException) {
    const messages: Partial<Record<string, MessageKey>> = {
      QuotaExceededError: 'errors.quota',
      NotAllowedError: 'errors.permission',
      SecurityError: 'errors.security',
      NotSupportedError: 'errors.unsupported',
      NotReadableError: 'errors.unreadable',
      NotFoundError: 'errors.notFound',
      NetworkError: 'errors.network',
      AbortError: 'errors.aborted',
    };
    const key = messages[error.name];
    if (key) return message(key);
  }
  // Retain unknown browser/library diagnostics rather than guessing their cause.
  return message('errors.unexpected', { details: String(error) });
}
