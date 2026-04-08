import type { Hook } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

const hook: Hook<"finally"> = async function finallyHook(options) {
  logger.debug("Symphony CLI command finished", {
    id: options.Command?.id ?? null,
    error: options.error ? String(options.error) : null
  });
};

export default hook;
