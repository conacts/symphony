import type { Hook } from "@oclif/core";
import { createSymphonyLogger } from "@symphony/logger";

const logger = createSymphonyLogger({
  name: "@symphony/cli"
});

const hook: Hook<"prerun"> = async function prerun(options) {
  logger.debug("Symphony CLI command starting", {
    id: options.Command.id
  });
};

export default hook;
