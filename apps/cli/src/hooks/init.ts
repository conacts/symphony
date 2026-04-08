import type { Hook } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

const hook: Hook<"init"> = async function init() {
  logger.debug("Symphony CLI initialized");
};

export default hook;
