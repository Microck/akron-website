export const privateDataCollection: {
  userInfo: false; cookies: false; httpHeaders: false; httpBodies: [];
  urlQueryParams: false; graphQL: { document: false; variables: false };
  genAI: { inputs: false; outputs: false }; databaseQueryData: false;
  queues: false; stackFrameVariables: false; frameContextLines: 0;
};
export function parseSentryDsn(value: unknown): { dsn: string; envelopeUrl: string } | null;
export function sanitizeErrorEvent<T extends object>(event: T): T | null;
export function isAbortError(error: unknown): boolean;
export function createOutageReporter(capture: (error: unknown, tags: Record<string, string>) => void): {
  failure(operation: string, error: unknown, offline?: boolean): void;
  recovered(operation: string): void;
};
