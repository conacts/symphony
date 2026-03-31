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
  issueIdentifier: string;
  latestRunStartedAt: SymphonyIsoTimestamp;
  insertedAt: SymphonyIsoTimestamp;
  updatedAt: SymphonyIsoTimestamp;
};

export type SymphonyRunRecord = {
  runId: string;
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
  codexThreadId: string | null;
  codexTurnId: string | null;
  codexSessionId: string | null;
  promptText: string;
  status: string;
  startedAt: SymphonyIsoTimestamp;
  endedAt: SymphonyIsoTimestamp | null;
  tokens: SymphonyJsonObject | null;
  metadata: SymphonyJsonObject | null;
  insertedAt: SymphonyIsoTimestamp;
  updatedAt: SymphonyIsoTimestamp;
};

export type SymphonyEventRecord = {
  eventId: string;
  turnId: string;
  runId: string;
  eventSequence: number;
  eventType: string;
  recordedAt: SymphonyIsoTimestamp;
  payload: SymphonyJsonValue;
  payloadTruncated: boolean;
  payloadBytes: number;
  summary: string | null;
  codexThreadId: string | null;
  codexTurnId: string | null;
  codexSessionId: string | null;
  insertedAt: SymphonyIsoTimestamp;
};

export type SymphonyRunJournalDocument = {
  schemaVersion: "1";
  issues: SymphonyIssueRecord[];
  runs: SymphonyRunRecord[];
  turns: SymphonyTurnRecord[];
  events: SymphonyEventRecord[];
};

export type SymphonyRunStartAttrs = {
  issueId: string;
  issueIdentifier: string;
  runId?: string;
  attempt?: number | null;
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
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  promptText: string;
  status?: string;
  startedAt?: Date | SymphonyIsoTimestamp;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyEventAttrs = {
  eventId?: string;
  eventSequence?: number;
  eventType: string;
  recordedAt?: Date | SymphonyIsoTimestamp;
  payload?: SymphonyJsonValue;
  summary?: string | null;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
};

export type SymphonyTurnUpdateAttrs = {
  status?: string;
  startedAt?: Date | SymphonyIsoTimestamp | null;
  endedAt?: Date | SymphonyIsoTimestamp | null;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  tokens?: SymphonyJsonObject | null;
  metadata?: SymphonyJsonObject | null;
};

export type SymphonyTurnFinishAttrs = {
  status?: string;
  endedAt?: Date | SymphonyIsoTimestamp;
  codexThreadId?: string | null;
  codexTurnId?: string | null;
  codexSessionId?: string | null;
  tokens?: SymphonyJsonObject | null;
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
  issueId: string;
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
  issueId: string;
  issueIdentifier: string;
  attempt: number | null;
  status: string | null;
  outcome: string | null;
  workerHost: string | null;
  workspacePath: string | null;
  startedAt: SymphonyIsoTimestamp | null;
  endedAt: SymphonyIsoTimestamp | null;
  commitHashStart: string | null;
  commitHashEnd: string | null;
  turnCount: number;
  eventCount: number;
  lastEventType: string | null;
  lastEventAt: SymphonyIsoTimestamp | null;
  durationSeconds: number | null;
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

export type SymphonyRunJournalListOptions = {
  limit?: number;
};

export type SymphonyRunJournalProblemRunsOptions = SymphonyRunJournalListOptions & {
  outcome?: string;
  issueIdentifier?: string;
};

export type SymphonyFileBackedRunJournalOptions = {
  dbFile: string;
  retentionDays?: number;
  payloadMaxBytes?: number;
};

export interface SymphonyRunJournal {
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
  listIssues(opts?: SymphonyRunJournalListOptions): Promise<SymphonyIssueSummary[]>;
  listRunsForIssue(
    issueIdentifier: string,
    opts?: SymphonyRunJournalListOptions
  ): Promise<SymphonyRunSummary[]>;
  listProblemRuns(
    opts?: SymphonyRunJournalProblemRunsOptions
  ): Promise<SymphonyRunSummary[]>;
  fetchRunExport(runId: string): Promise<SymphonyRunExport | null>;
  pruneRetention(now?: Date): Promise<void>;
}
