import { UserRole } from "../constants/roles.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        /*
         * Freshly loaded from the database by the authenticate
         * middleware on every request, so a deactivation performed
         * by a Super Admin takes effect immediately.
         */
        isActive: boolean;
      };
    }
  }
}

export {};
