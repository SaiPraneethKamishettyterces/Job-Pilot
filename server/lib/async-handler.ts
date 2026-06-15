import type { Request, Response, NextFunction, RequestHandler } from "express";

// Wraps an async route handler so any thrown error (or rejected promise) is
// forwarded to Express's error-handling middleware instead of crashing the
// process or hanging the request. Lets handlers drop their own try/catch.
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };
}
