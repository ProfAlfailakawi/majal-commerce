import type { NextFunction, Request, Response, Router } from 'express';

/**
 * Express 4 does not route rejected promises from async handlers to the error middleware,
 * so a thrown DB error leaves the request hanging until the socket times out. This wraps
 * every handler registered on the router so rejections reach `next(err)`.
 */
export function catchAsyncErrors(router: Router): Router {
  for (const method of ['get', 'post', 'put', 'patch', 'delete', 'all'] as const) {
    const original = router[method].bind(router) as (...args: unknown[]) => Router;
    (router as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => original(...args.map(arg =>
      typeof arg === 'function' && arg.length < 4
        ? (req: Request, res: Response, next: NextFunction) => {
            try {
              const result = (arg as (...a: unknown[]) => unknown)(req, res, next);
              if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(next);
            } catch (error) { next(error); }
          }
        : arg));
  }
  return router;
}
