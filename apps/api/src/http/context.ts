import type { SymphonyLogger } from "@symphony/logger";

export type SymphonyRuntimeAppContextSchema = {
  Variables: {
    requestStartedAt: number;
    requestId: string;
    logger: SymphonyLogger;
  };
};
