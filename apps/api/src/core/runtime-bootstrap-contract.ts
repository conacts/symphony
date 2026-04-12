import type {
  SymphonyRuntimeWorkflowPresetSelection
} from "./runtime-workflow-preset-selection.js";

export type SymphonyRuntimePersistedWorkspaceBindingScope = {
  organizationId: string;
  linearWorkspaceIdentityId: string;
};

export type SymphonyRuntimePersistedWorkspaceBindingRepositorySource = {
  kind: "persisted_workspace_bindings";
  source: "database";
  sourceRepos: string[];
  bindingScope: SymphonyRuntimePersistedWorkspaceBindingScope;
};

export type SymphonyRuntimeBootstrapRepositorySource = {
  kind: "admitted_source_repositories";
  source: "environment" | "explicit";
  sourceRepos: string[];
} | SymphonyRuntimePersistedWorkspaceBindingRepositorySource;

export type SymphonyRuntimeBootstrapBinding = {
  kind: "workflow_binding";
  repositorySource: SymphonyRuntimeBootstrapRepositorySource;
  defaultRepositoryKey: string;
  manifestPath: string | null;
  bindingScope: SymphonyRuntimePersistedWorkspaceBindingScope | null;
  presetSelection: SymphonyRuntimeWorkflowPresetSelection;
};
