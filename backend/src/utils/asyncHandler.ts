import type {
  NextFunction,
  Request,
  Response,
} from "express";

type DefaultParams = Request["params"];

type AsyncController<
  P = DefaultParams,
> = (
  req: Request<P>,
  res: Response,
  next: NextFunction,
) => Promise<void>;

export const asyncHandler =
  <P = DefaultParams>(
    controller: AsyncController<P>,
  ) =>
  (
    req: Request<P>,
    res: Response,
    next: NextFunction,
  ): void => {
    controller(req, res, next).catch(next);
  };