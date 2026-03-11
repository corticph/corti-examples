import type { NextFunction, Request, Response } from "express";

/**
 * Wraps an async route handler so Express receives a void return and errors are passed to next().
 */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res).catch(next);
  };
}
