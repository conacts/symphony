import { normalizeIssueState } from "../workflow/symphony-workflow.js";
import {
  asRecord,
  getArrayPath,
  getRecord,
  getRecordPath,
  getString,
  getStringPath
} from "../internal/records.js";
import type { SymphonyTrackerIssue } from "./symphony-tracker.js";

export type LinearAssigneeFilter = {
  configuredAssignee: string;
  matchValues: Set<string>;
} | null;

export function normalizeLinearIssue(
  issue: Record<string, unknown> | null,
  assigneeFilter: LinearAssigneeFilter
): SymphonyTrackerIssue | null {
  if (!issue) {
    return null;
  }

  const assignee = getRecord(issue, "assignee");
  const project = getRecord(issue, "project");
  const team = getRecord(issue, "team");

  const id = getString(issue, "id");
  const identifier = getString(issue, "identifier");
  const title = getString(issue, "title");
  const state = getStringPath(issue, ["state", "name"]);

  if (!id || !identifier || !title || !state) {
    return null;
  }

  return {
    id,
    identifier,
    title,
    description: getNullableString(issue, "description"),
    priority: parsePriority(issue.priority),
    state,
    branchName: getNullableString(issue, "branchName"),
    url: getNullableString(issue, "url"),
    projectId: getNullableString(project, "id"),
    projectName: getNullableString(project, "name"),
    projectSlug: getNullableString(project, "slugId"),
    teamKey: getNullableString(team, "key"),
    assigneeId: getNullableString(assignee, "id"),
    blockedBy: extractBlockers(issue),
    labels: extractLabels(issue),
    assignedToWorker: assignedToWorker(assignee, assigneeFilter),
    createdAt: getNullableString(issue, "createdAt"),
    updatedAt: getNullableString(issue, "updatedAt")
  };
}

export function normalizeAssigneeMatchValue(
  value: string | null | undefined
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function extractLabels(issue: Record<string, unknown>): string[] {
  const labels = getArrayPath(getRecordPath(issue, ["labels"]), ["nodes"]);

  return labels
    .map((label) => getNullableString(asRecord(label), "name"))
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.toLowerCase());
}

function extractBlockers(issue: Record<string, unknown>): string[] {
  const inverseRelations = getArrayPath(
    getRecordPath(issue, ["inverseRelations"]),
    ["nodes"]
  );

  return inverseRelations.flatMap((relation) => {
    const relationRecord = asRecord(relation);
    if (!relationRecord) {
      return [];
    }

    const relationType = getNullableString(relationRecord, "type");
    if (normalizeIssueState(relationType) !== "blocks") {
      return [];
    }

    const blockerIssue = getRecord(relationRecord, "issue");
    const blockerId = blockerIssue ? getNullableString(blockerIssue, "id") : null;
    return blockerId ? [blockerId] : [];
  });
}

function assignedToWorker(
  assignee: Record<string, unknown> | null,
  assigneeFilter: LinearAssigneeFilter
): boolean {
  if (!assigneeFilter) {
    return true;
  }

  const assigneeId = normalizeAssigneeMatchValue(getNullableString(assignee, "id"));
  if (!assigneeId) {
    return false;
  }

  return assigneeFilter.matchValues.has(assigneeId);
}

function parsePriority(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function getNullableString(
  value: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  return getString(value, key);
}
