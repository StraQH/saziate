import { getDb } from "@/db";
import { auditLogs } from "@/db/schema";

export interface LogAuditParams {
  actorId?: string | null;
  action: string; // e.g. "resident.created", "invoice.cancelled", "rate.updated"
  entityType: string;
  entityId: string;
  meta?: any;
}

/**
 * Audit and Error Logger Utility for Saziate.
 * Records operational logs inside D1 and outputs messages to the stdout console.
 */
export class SaziateLogger {
  private dbBinding: D1Database;

  constructor(dbBinding: D1Database) {
    if (!dbBinding) {
      throw new Error("Cloudflare D1 Database binding is required for auditing.");
    }
    this.dbBinding = dbBinding;
  }

  /**
   * Log operational audit entry to D1.
   */
  async logAudit(params: LogAuditParams): Promise<void> {
    try {
      const db = getDb(this.dbBinding);
      const logId = crypto.randomUUID();

      await db.insert(auditLogs).values({
        id: logId,
        actorId: params.actorId || null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        meta: params.meta ? JSON.stringify(params.meta) : null,
      });

      console.info(`[AUDIT] ${params.action} on ${params.entityType}:${params.entityId}`);
    } catch (err: any) {
      console.error(`[AUDIT_ERROR] Failed to write audit log: ${err.message}`);
    }
  }

  /**
   * Log warning entry.
   */
  warn(message: string, context?: any): void {
    console.warn(`[WARN] ${message}`, context ? JSON.stringify(context) : "");
  }

  /**
   * Log critical error entry.
   */
  error(message: string, error?: Error | any, context?: any): void {
    console.error(
      `[ERROR] ${message} | Details: ${error?.message || String(error)}`,
      context ? JSON.stringify(context) : ""
    );
  }
}
