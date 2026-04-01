import { and, eq, lt } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { symphonyGitHubIngressTable } from "./schema.js";

const retentionDays = 14;

export type SymphonyGitHubIngressRecordStatus =
  | "recorded"
  | "duplicate_delivery"
  | "duplicate_semantic";

export interface SymphonyGitHubIngressJournal {
  record(input: {
    delivery: string;
    event: string;
    repository: string;
    action: string | null;
    semanticKey: string | null;
  }): SymphonyGitHubIngressRecordStatus;
}

export function createSymphonyGitHubIngressJournal(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyGitHubIngressJournal {
  return {
    record(input) {
      const now = new Date();
      const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000)
        .toISOString();

      db.delete(symphonyGitHubIngressTable)
        .where(lt(symphonyGitHubIngressTable.recordedAt, cutoff))
        .run();

      const existingDelivery = db
        .select({ deliveryId: symphonyGitHubIngressTable.deliveryId })
        .from(symphonyGitHubIngressTable)
        .where(eq(symphonyGitHubIngressTable.deliveryId, input.delivery))
        .get();

      if (existingDelivery) {
        return "duplicate_delivery";
      }

      if (input.semanticKey) {
        const existingSemantic = db
          .select({ deliveryId: symphonyGitHubIngressTable.deliveryId })
          .from(symphonyGitHubIngressTable)
          .where(
            and(
              eq(symphonyGitHubIngressTable.repository, input.repository),
              eq(symphonyGitHubIngressTable.semanticKey, input.semanticKey)
            )
          )
          .get();

        if (existingSemantic) {
          db.insert(symphonyGitHubIngressTable)
            .values({
              deliveryId: input.delivery,
              event: input.event,
              repository: input.repository,
              action: input.action,
              semanticKey: input.semanticKey,
              recordedAt: now.toISOString()
            })
            .run();

          return "duplicate_semantic";
        }
      }

      db.insert(symphonyGitHubIngressTable)
        .values({
          deliveryId: input.delivery,
          event: input.event,
          repository: input.repository,
          action: input.action,
          semanticKey: input.semanticKey,
          recordedAt: now.toISOString()
        })
        .run();

      return "recorded";
    }
  };
}
