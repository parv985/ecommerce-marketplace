import { AuditLog } from "../models/AuditLog.js";

/*
 * Centralized audit logging. Call sites pass only structured, safe
 * fields: passwords, tokens, OTPs, TOTP secrets and payment
 * credentials must never be passed to before/after/metadata.
 */
export const logAudit = async (input: {
  actorId: string;
  actorRole: string;
  action: string; 
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}): Promise<void> => {
  await AuditLog.create({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? null,
  });
};
