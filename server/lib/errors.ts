// Typed application error. Throw these from routes/services; the central
// error-handler middleware turns them into a consistent JSON response.

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string, code?: string) => new AppError(400, message, code);
export const unauthorized = (message = "Unauthorized") => new AppError(401, message);
export const forbidden = (message = "Forbidden") => new AppError(403, message);
export const notFound = (message = "Not found") => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const paymentRequired = (message: string) => new AppError(402, message);
