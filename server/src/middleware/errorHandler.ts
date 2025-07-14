import { NextFunction, Request, Response } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err.stack);

  if (err.message.includes('Connection') && err.message.includes('not found')) {
    res.status(404).json({ error: err.message });
    return;
  }

  if (
    err.message.includes('ECONNREFUSED') ||
    err.message.includes('ETIMEDOUT')
  ) {
    res.status(503).json({ error: 'Failed to connect to Redis server' });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
