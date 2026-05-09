export class AppError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new AppError(400, message, details);
}

export function notFound(message, details) {
  return new AppError(404, message, details);
}

export function methodNotAllowed(message = 'Method not allowed', details) {
  return new AppError(405, message, details);
}

export function upstreamError(message, details, statusCode = 502) {
  return new AppError(statusCode, message, details);
}
