import { describe, expect, it } from "vitest";
import { isDockerMissingObject } from "./docker-client.js";
import {
  inspectDockerNetwork,
  removeDockerNetwork
} from "./docker-inspect.js";
import type { DockerWorkspaceDescriptor } from "./docker-shared.js";

describe("docker inspect helpers", () => {
  it("treats docker's network not found stderr variant as a missing object", () => {
    expect(
      isDockerMissingObject(
        "Error response from daemon: network symphony-workspace-network-col-123 not found"
      )
    ).toBe(true);
  });

  it("treats docker's image not found stderr variant as a missing object", () => {
    expect(
      isDockerMissingObject(
        "Error response from daemon: No such image: symphony/workspace-runner:local"
      )
    ).toBe(true);
  });

  it("returns null when network inspect reports docker's not found variant", async () => {
    const network = await inspectDockerNetwork(
      async () => ({
        exitCode: 1,
        stdout: "[]\n",
        stderr:
          "Error response from daemon: network symphony-workspace-network-col-123 not found"
      }),
      "symphony-workspace-network-col-123",
      1_000
    );

    expect(network).toBeNull();
  });

  it("treats cleanup as missing when network inspect reports docker's not found variant", async () => {
    const descriptor: DockerWorkspaceDescriptor = {
      issueIdentifier: "COL-123",
      workspaceKey: "COL_123",
      containerName: "symphony-workspace-col_123-12345678",
      networkName: "symphony-workspace-network-col-123",
      materialization: {
        kind: "volume",
        hostPath: null,
        volumeName: "symphony-workspace-volume-col-123"
      }
    };

    const disposition = await removeDockerNetwork(
      async () => ({
        exitCode: 1,
        stdout: "[]\n",
        stderr:
          "Error response from daemon: network symphony-workspace-network-col-123 not found"
      }),
      descriptor.networkName ?? "",
      descriptor,
      1_000
    );

    expect(disposition).toBe("missing");
  });
});
