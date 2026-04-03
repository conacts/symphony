import { describe, expect, it } from "vitest";
import { SymphonyRuntimeManifestError } from "@symphony/runtime-contract";
import { SymphonyWorkspaceError } from "@symphony/workspace";
import { classifyStartupFailureOrigin } from "./symphony-orchestrator-failures.js";

describe("startup failure classification", () => {
  it("classifies missing repo env as a repo contract failure", () => {
    const error = new SymphonyRuntimeManifestError(
      "runtime_manifest_env_resolution_failed",
      "missing repo env",
      {
        issues: [
          {
            path: "env.repo.required[0]",
            message: "missing"
          }
        ]
      }
    );

    expect(
      classifyStartupFailureOrigin(error, "workspace_prepare", "docker")
    ).toBe("repo_env_contract");
  });

  it("classifies missing host auth as a host auth contract failure", () => {
    const error = new SymphonyRuntimeManifestError(
      "runtime_manifest_env_resolution_failed",
      "missing host env",
      {
        issues: [
          {
            path: "env.host.required[0]",
            message: "missing"
          }
        ]
      }
    );

    expect(
      classifyStartupFailureOrigin(error, "workspace_prepare", "docker")
    ).toBe("host_auth_contract");
  });

  it("classifies docker image issues separately from generic docker backend failures", () => {
    expect(
      classifyStartupFailureOrigin(
        new SymphonyWorkspaceError("workspace_docker_image_invalid", "bad image"),
        "workspace_prepare",
        "docker"
      )
    ).toBe("image_tooling_contract");

    expect(
      classifyStartupFailureOrigin(
        new SymphonyWorkspaceError("workspace_docker_unavailable", "daemon down"),
        "workspace_prepare",
        "docker"
      )
    ).toBe("docker_backend_contract");
  });

  it("classifies codex auth availability errors explicitly", () => {
    const error = Object.assign(new Error("missing codex auth"), {
      code: "codex_auth_unavailable"
    });

    expect(
      classifyStartupFailureOrigin(error, "runtime_session_start", "docker")
    ).toBe("codex_auth_contract");
  });
});
