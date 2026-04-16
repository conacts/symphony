import type {
  SymphonyIssueStore,
  SymphonyWorkspaceBindingCatalog
} from "@symphony/db";
import type { SymphonyTrackerIssue } from "@symphony/tracker";
import type { AdmittedRuntimeRepository } from "./runtime-admitted-repositories.js";
import type { SymphonyRuntimeBootstrapBinding } from "./runtime-bootstrap-contract.js";
import { resolveIssueRepositorySelection } from "./runtime-repository-routing.js";

export function createTrackedIssueRepositoryAccessors(input: {
  admittedRepositories: AdmittedRuntimeRepository[];
  bindingCatalog: SymphonyWorkspaceBindingCatalog | null;
  bindingScope: SymphonyRuntimeBootstrapBinding["bindingScope"];
  issueStore: SymphonyIssueStore;
}) {
  const resolveTrackedIssueRepositorySelection = (issue: SymphonyTrackerIssue) =>
    resolveIssueRepositorySelection(
      input.admittedRepositories,
      issue,
      input.bindingCatalog
    );
  const resolveTrackedIssueRepositoryKey = (issue: SymphonyTrackerIssue) =>
    resolveTrackedIssueRepositorySelection(issue).repository.repositoryKey;

  const seedTrackedIssueIdentity = async (issue: SymphonyTrackerIssue) => {
    const resolvedRepository = resolveTrackedIssueRepositorySelection(issue);
    const repositoryWorkspaceBindingId =
      resolvedRepository.repositoryWorkspaceBinding?.repositoryWorkspaceBindingId ??
      null;

    await input.issueStore.upsert(
      input.bindingScope === null
        ? {
            issueIdentifier: issue.identifier,
            trackerIssueId: issue.id,
            repositoryKey: resolvedRepository.repository.repositoryKey,
            latestRunStartedAt: null,
            recordedAt: new Date().toISOString()
          }
        : {
            issueIdentifier: issue.identifier,
            trackerIssueId: issue.id,
            repositoryKey: resolvedRepository.repository.repositoryKey,
            bindingScope: input.bindingScope,
            repositoryWorkspaceBindingId:
              repositoryWorkspaceBindingId ??
              (() => {
                throw new TypeError(
                  `Hosted issue ${issue.identifier} requires a repository workspace binding id.`
                );
              })(),
            latestRunStartedAt: null,
            recordedAt: new Date().toISOString()
          }
    );
  };

  return {
    resolveTrackedIssueRepositorySelection,
    resolveTrackedIssueRepositoryKey,
    seedTrackedIssueIdentity
  };
}
