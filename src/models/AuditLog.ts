import { Schema, model, type Types } from "mongoose";

export interface IAuditLog {
  _id: Types.ObjectId;
  /*
   * String so system actors ("webhook", "system") can be recorded
   * alongside user ids. Never stores secrets - only actor identity.
   */
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    actorId: {
      type: String,
      required: true,
      index: true,
    },

    actorRole: {
      type: String,
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      index: true,
    },

    entityType: {
      type: String,
      required: true,
      index: true,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    before: {
      type: Schema.Types.Mixed,
      default: null,
    },

    after: {
      type: Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });

export const AuditLog = model<IAuditLog>(
  "AuditLog",
  auditLogSchema,
);
