import type {
  SymphonyAgentAnalyticsEvent,
  SymphonyAgentAnalyticsEventType,
  SymphonyAgentThreadItemStatus,
  SymphonyAgentThreadItemType,
  SymphonyAgentUsage
} from "./agent-analytics-types.js";

export type SymphonyIsoTimestamp = string;

export type SymphonyJsonValue =
  | string
  | number
  | boolean
  | null
  | SymphonyJsonValue[]
  | { [key: string]: SymphonyJsonValue };

export type SymphonyJsonObject = { [key: string]: SymphonyJsonValue };

export type SymphonyIssueRecord = {
  issueId: string;
  repositoryKey: string;
  issueIdentifier: string;
  latestRunStartedAt: SymphonyIsoTimestamp;
  insertedAt: SymphonyIsoTimestamp;
  updatedAt: SymphonyIsoTimestamp;
};

export type SymphonyRunRecord = {
  runId: string;
  repositoryKey: string;
  issueId: string;
  issueIdentifier: string;
  attempt: number | null;
  status: string;
  outcome: string | null;
  workerHost: string | null;
  workspacePath: string | null;
  startedAt: SymphonyIsoTimestamp;
  endedAt: SymphonyIsoTimestamp | null;
  commitHashStart: string | null;
  commitHashEnd: string | null;
  repoStart: SymphonyJsonObject | null;
  repoEnd: SymphonyJsonObject | null;
  metadata: SymphonyJsonObject | null;
  errorClass: string | null;
  errorMessage: string | null;
  insertedAt: SymphonyIsoTimestamp;
  updatedAt: SymphonyIsoTimestamp;
};

export type SymphonyTurnRecord = {
  turnId: string;
  runId: string;
  turnSequence: number;
  threadId: string;
  agentTurnId: string | null;
  promptText: string;
  status: string;
  startedAt: SymphonyIsoTimestamp;
  endedAt: SymphonyIsoTimestamp | null;
  usage: SymphonyAgentUsage | null;
  metadata: SymphonyJsonObject | null;
  insertedAt: SymphonyIsoTimestamp;
  updatedAt: SymphonyIsoTimestamp;
};

export type SymphonyEventRecord = {
  eventId: string;
  turnId: string;
  runId: string;
  eventSequence: number;
  eventType: SymphonyAgentAnalyticsEventType;
  itemType: SymphonyAgentThreadItemType | null;
  itemStatus: SymphonyAgentThreadItemStatus;
  recordedAt: SymphonyIsoTimestamp;
  payload: SymphonyAgentAnalyticsEvent;
  payloadTruncated: boolean;
  payloadBytes: number;
  summary: string | null;
  threadId: string;
  agentTurnId: string | null;
  insertedAt: SymphonyIsoTimestamp;
};

export type SymphonyRuntimeRunLedgerDocument = {
  schemaVersion: "1";
  issues: SymphonyIssueRecord[];
  runs: SymphonyRunRecord[];
  turns: SymphonyTurnRecord[];
  events: SymphonyEventRecord[];
};

export type SymphonyRunStartAttrs = {
  repositoryKey: string;
  issueId: string;
  issueIdentifier: string;
  runId?: string;
  attempt?: number | null;
  runMode: "implementation" | "rework" | "approved_merge";
  status?: string;
  workerHost?: string | null;
  workspacePath?: string | null;
  startedAt?: Date | SymphonyIsoTimestamp;
  commitHashStart?: string | null;
  repoStart?: SymphonyJsonObject | null;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyTurnStartAttrs = {
  turnId?: string;
  turnSequence?: number;
  threadId?: string;
  agentTurnId?: string | null;
  promptText: string;
  status?: string;
  startedAt?: Date | SymphonyIsoTimestamp;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyEventAttrs = {
  eventId?: string;
  eventSequence?: number;
  eventType: SymphonyAgentAnalyticsEventType;
  recordedAt?: Date | SymphonyIsoTimestamp;
  payload: SymphonyAgentAnalyticsEvent;
  summary?: string | null;
  threadId?: string | null;
  agentTurnId?: string | null;
};

export type SymphonyTurnUpdateAttrs = {
  status?: string;
  startedAt?: Date | SymphonyIsoTimestamp | null;
  endedAt?: Date | SymphonyIsoTimestamp | null;
  threadId?: string;
  agentTurnId?: string | null;
  usage?: SymphonyAgentUsage | null;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyTurnFinishAttrs = {
  status?: string;
  endedAt?: Date | SymphonyIsoTimestamp;
  threadId?: string;
  agentTurnId?: string | null;
  usage?: SymphonyAgentUsage | null;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyRunUpdateAttrs = {
  status?: string;
  outcome?: string | null;
  workerHost?: string | null;
  workspacePath?: string | null;
  startedAt?: Date | SymphonyIsoTimestamp | null;
  endedAt?: Date | SymphonyIsoTimestamp | null;
  commitHashStart?: string | null;
  commitHashEnd?: string | null;
  repoStart?: SymphonyJsonObject | null;
  repoEnd?: SymphonyJsonObject | null;
  metadata?: SymphonyJsonObject | null;
  errorClass?: string | null;
  errorMessage?: string | null;
};

export type SymphonyRunFinishAttrs = {
  status?: string;
  outcome?: string | null;
  endedAt?: Date | SymphonyIsoTimestamp;
  commitHashEnd?: string | null;
  repoEnd?: SymphonyJsonObject | null;
  metadata?: SymphonyJsonObject | null;
  errorClass?: string | null;
  errorMessage?: string | null;
};

export type SymphonyIssueSummary = {
  trackerIssueId: string;
  repositoryKey: string;
  issueIdentifier: string;
  latestRunStartedAt: SymphonyIsoTimestamp | null;
  latestRunId: string | null;
  latestRunStatus: string | null;
  latestRunOutcome: string | null;
  runCount: number;
  latestProblemOutcome: string | null;
  lastCompletedOutcome: string | null;
  insertedAt: SymphonyIsoTimestamp | null;
  updatedAt: SymphonyIsoTimestamp | null;
};

export type SymphonyRunSummary = {
  runId: string;
  repositoryKey: string;
  trackerIssueId: string;
  issueIdentifier: string;
  attempt: number | null;
  status: string | null;
  outcome: string | null;
  workerHost: string | null;
  workspacePath: string | null;
  startedAt: SymphonyIsoTimestamp;
  endedAt: SymphonyIsoTimestamp | null;
  commitHashStart: string | null;
  commitHashEnd: string | null;
  turnCount: number;
  eventCount: number;
  lastEventType: string | null;
  lastEventAt: SymphonyIsoTimestamp | null;
  durationSeconds: number | null;
  errorClass: string | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type SymphonyTurnExport = SymphonyTurnRecord & {
  eventCount: number;
  events: SymphonyEventRecord[];
};

export type SymphonyRunExport = {
  issue: SymphonyIssueSummary;
  run: SymphonyRunRecord;
  turns: SymphonyTurnExport[];
};

export type SymphonyRuntimeRunLedgerListOptions = {
  limit?: number;
};

export type SymphonyRuntimeRunLedgerRunsOptions = SymphonyRuntimeRunLedgerListOptions & {
  issueIdentifier?: string;
  outcome?: string;
  errorClass?: string;
  startedAfter?: SymphonyIsoTimestamp;
  startedBefore?: SymphonyIsoTimestamp;
  problemOnly?: boolean;
};

export type SymphonyRuntimeRunLedgerProblemRunsOptions = SymphonyRuntimeRunLedgerListOptions & {
  outcome?: string;
  issueIdentifier?: string;
};

export type SymphonyFileBackedRuntimeRunLedgerOptions = {
  dbFile: string;
  retentionDays?: number;
  payloadMaxBytes?: number;
};

export interface SymphonyRuntimeRunLedger {
  readonly dbFile: string;
  readonly retentionDays: number;
  readonly payloadMaxBytes: number;
  recordRunStarted(attrs: SymphonyRunStartAttrs): Promise<string>;
  recordTurnStarted(runId: string, attrs: SymphonyTurnStartAttrs): Promise<string>;
  recordEvent(runId: string, turnId: string, attrs: SymphonyEventAttrs): Promise<string>;
  updateTurn(turnId: string, attrs: SymphonyTurnUpdateAttrs): Promise<void>;
  finalizeTurn(turnId: string, attrs: SymphonyTurnFinishAttrs): Promise<void>;
  updateRun(runId: string, attrs: SymphonyRunUpdateAttrs): Promise<void>;
  finalizeRun(runId: string, attrs: SymphonyRunFinishAttrs): Promise<void>;
  listIssues(opts?: SymphonyRuntimeRunLedgerListOptions): Promise<SymphonyIssueSummary[]>;
  listRuns(opts?: SymphonyRuntimeRunLedgerRunsOptions): Promise<SymphonyRunSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: SymphonyRuntimeRunLedgerListOptions
  ): Promise<SymphonyRunSummary[]>;
  listProblemRuns(
    opts?: SymphonyRuntimeRunLedgerProblemRunsOptions
  ): Promise<SymphonyRunSummary[]>;
  fetchRunExport(runId: string): Promise<SymphonyRunExport | null>;
  pruneRetention(now?: Date): Promise<void>;
}

export type SymphonyRunJournalDocument = SymphonyRuntimeRunLedgerDocument;
export type SymphonyRunJournalListOptions = SymphonyRuntimeRunLedgerListOptions;
export type SymphonyRunJournalRunsOptions = SymphonyRuntimeRunLedgerRunsOptions;
export type SymphonyRunJournalProblemRunsOptions =
  SymphonyRuntimeRunLedgerProblemRunsOptions;
export type SymphonyFileBackedRunJournalOptions =
  SymphonyFileBackedRuntimeRunLedgerOptions;
export type SymphonyRunJournal = SymphonyRuntimeRunLedger;
