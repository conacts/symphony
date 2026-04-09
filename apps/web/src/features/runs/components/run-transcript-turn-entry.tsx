"use client";

import React from "react";
import type { ReactNode } from "react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger
} from "@/components/ai-elements/reasoning";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger
} from "@/components/ai-elements/task";
import {
  BrainIcon,
  ChevronDownIcon,
  PencilIcon,
  SearchIcon,
  UploadIcon
} from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse
} from "@/components/ai-elements/message";
import { RunTranscriptCopy } from "@/features/runs/components/run-transcript-copy";
import { RunTranscriptTaskDiffPreview } from "@/features/runs/components/run-transcript-task-diff-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCount } from "@/core/display-formatters";
import type { AgentRunTranscriptEntry } from "@/features/runs/model/agent-run-transcript";

type ReasoningEntry = Extract<AgentRunTranscriptEntry, { kind: "reasoning" }>;
type PiReadTaskEntry = Extract<AgentRunTranscriptEntry, { kind: "pi-read-task" }>;
type PiEditTaskEntry = Extract<AgentRunTranscriptEntry, { kind: "pi-edit-task" }>;
type PiWriteTaskEntry = Extract<AgentRunTranscriptEntry, { kind: "pi-write-task" }>;
type PiGrepTaskEntry = Extract<AgentRunTranscriptEntry, { kind: "pi-grep-task" }>;
type PiFindTaskEntry = Extract<AgentRunTranscriptEntry, { kind: "pi-find-task" }>;

export function RunTranscriptTurnEntry(input: {
  entry: AgentRunTranscriptEntry;
  onOpenOverflow: (entry: AgentRunTranscriptEntry) => void;
}) {
  const { entry, onOpenOverflow } = input;

  if (entry.kind === "agent-message") {
    return (
      <Message from="assistant">
        <MessageContent className="gap-2 max-w-full">
          <TranscriptMetaRow
            items={[
              entry.recordedAt,
              `${formatCount(entry.piMessage?.totalTokens ?? 0)} tokens`
            ]}
          />
          <MessageResponse>{entry.contentText}</MessageResponse>
          <EntryFiles files={entry.files} />
        </MessageContent>
      </Message>
    );
  }

  if (entry.kind === "reasoning") {
    return (
      <div className="space-y-2">
        <TranscriptMetaRow
          items={[
            entry.recordedAt,
            `${formatCount(entry.piMessage?.totalTokens ?? 0)} tokens`
          ]}
        />
        <Reasoning className="mb-0" defaultOpen={false}>
          <ReasoningTrigger className="items-center gap-2">
            <BrainIcon className="size-4" />
            <span className="text-sm font-medium text-foreground">
              {buildReasoningLabel(entry)}
            </span>
            <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </ReasoningTrigger>
          <ReasoningContent>{entry.contentText}</ReasoningContent>
        </Reasoning>
      </div>
    );
  }

  if (entry.kind === "pi-read-task") {
    return (
      <PiTaskCard
        entry={entry}
        icon={<SearchIcon className="size-4" />}
        title={buildPiReadTaskTitle(entry)}
      >
        {entry.paths.length > 0 ? (
          entry.paths.map((path) => (
            <TaskItem key={`${entry.itemId}:${path}`}>
              <TaskItemFile>{path}</TaskItemFile>
            </TaskItem>
          ))
        ) : (
          <TaskItem>No file paths were captured for this read.</TaskItem>
        )}
      </PiTaskCard>
    );
  }

  if (entry.kind === "pi-edit-task") {
    return (
      <PiTaskCard
        entry={entry}
        icon={<PencilIcon className="size-4" />}
        title={buildPiEditTaskTitle(entry)}
      >
        <TaskItem>{formatPiEditLineCount(entry.lineCount)}</TaskItem>
        {entry.firstChangedLine ? (
          <TaskItem>First changed line {entry.firstChangedLine}</TaskItem>
        ) : null}
        {entry.paths.length > 0 ? (
          entry.paths.map((path) => (
            <TaskItem key={`${entry.itemId}:${path}`}>
              <TaskItemFile>{path}</TaskItemFile>
            </TaskItem>
          ))
        ) : (
          <TaskItem>No file paths were captured for this edit.</TaskItem>
        )}
        {entry.diffText ? (
          <RunTranscriptTaskDiffPreview diffText={entry.diffText} />
        ) : null}
      </PiTaskCard>
    );
  }

  if (entry.kind === "pi-write-task") {
    return (
      <PiTaskCard
        entry={entry}
        icon={<UploadIcon className="size-4" />}
        title={buildPiWriteTaskTitle(entry)}
      >
        <TaskItem>{formatPiWriteLineCount(entry.lineCount)}</TaskItem>
        {entry.paths.length > 0 ? (
          entry.paths.map((path) => (
            <TaskItem key={`${entry.itemId}:${path}`}>
              <TaskItemFile>{path}</TaskItemFile>
            </TaskItem>
          ))
        ) : (
          <TaskItem>No file paths were captured for this write.</TaskItem>
        )}
        {entry.diffText ? (
          <RunTranscriptTaskDiffPreview diffText={entry.diffText} />
        ) : null}
      </PiTaskCard>
    );
  }

  if (entry.kind === "pi-grep-task") {
    return (
      <PiTaskCard
        entry={entry}
        icon={<SearchIcon className="size-4" />}
        title={buildPiGrepTaskTitle(entry)}
      >
        {entry.queries.length > 0 ? (
          entry.queries.map((query, index) => (
            <TaskItem key={`${entry.itemId}:${query.pattern}:${query.path ?? index}`}>
              <span className="font-medium text-foreground">{query.pattern}</span>
              {" "}
              {query.scopeLabel}
              {query.ignoreCase ? " (ignore case)" : ""}
            </TaskItem>
          ))
        ) : (
          <TaskItem>No search pattern was captured for this grep.</TaskItem>
        )}
      </PiTaskCard>
    );
  }

  if (entry.kind === "pi-find-task") {
    return (
      <PiTaskCard
        entry={entry}
        icon={<SearchIcon className="size-4" />}
        title={buildPiFindTaskTitle(entry)}
      >
        {entry.queries.length > 0 ? (
          entry.queries.map((query, index) => (
            <TaskItem key={`${entry.itemId}:${query.pattern}:${query.path ?? index}`}>
              <span className="font-medium text-foreground">{query.pattern}</span>
              {" "}
              {query.scopeLabel}
            </TaskItem>
          ))
        ) : (
          <TaskItem>No search target was captured for this find.</TaskItem>
        )}
      </PiTaskCard>
    );
  }

  if (entry.kind === "command") {
    return (
      <div className="space-y-2">
        <TranscriptMetaRow
          items={[
            entry.recordedAt,
            entry.duration,
            entry.timeoutSeconds !== null ? formatTimeoutSeconds(entry.timeoutSeconds) : null
          ]}
        />
        <Task className="mb-0" defaultOpen={false}>
          <TaskTrigger title={entry.command}>
            <div className="flex w-full cursor-pointer items-start gap-2 text-sm text-foreground transition-colors hover:text-foreground">
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap group-data-[state=open]:overflow-visible group-data-[state=open]:whitespace-normal">
                {entry.command}
              </span>
              <ChevronDownIcon className="mt-0.5 size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
            </div>
          </TaskTrigger>
          <TaskContent>
            <RunTranscriptCopy className="rounded-md border border-border/70 bg-muted/40 p-3 font-mono text-xs leading-5">
              {entry.outputText}
            </RunTranscriptCopy>
            <EntryFiles files={entry.files} />
            {entry.overflowId ? (
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={() => onOpenOverflow(entry)}>
                  View full command output
                </Button>
              </div>
            ) : null}
          </TaskContent>
        </Task>
      </div>
    );
  }

  if (entry.kind === "tool-call") {
    return null;
  }

  if (entry.kind === "todo-list") {
    return (
      <Message from="assistant">
        <MessageContent className="gap-3">
          <TranscriptMetaRow items={[entry.recordedAt]} />
          <MessageResponse>{entry.markdownText}</MessageResponse>
          <EntryFiles files={entry.files} />
        </MessageContent>
      </Message>
    );
  }

  return (
    <div className="space-y-3">
      <TranscriptMetaRow items={[entry.recordedAt, entry.itemType, entry.status]} />
      <div className="space-y-3">
        <RunTranscriptCopy>{entry.contentText}</RunTranscriptCopy>
        <EntryFiles files={entry.files} />
        {entry.overflowId ? (
          <Button size="sm" variant="outline" onClick={() => onOpenOverflow(entry)}>
            View full payload
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PiTaskCard(input: {
  entry:
    | PiReadTaskEntry
    | PiEditTaskEntry
    | PiWriteTaskEntry
    | PiGrepTaskEntry
    | PiFindTaskEntry;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <TranscriptMetaRow items={[input.entry.recordedAt]} />
      <Task className="mb-0" defaultOpen={false}>
        <TaskTrigger title={input.title}>
          <div className="flex w-full cursor-pointer items-center gap-2 text-sm text-foreground transition-colors hover:text-foreground">
            {input.icon}
            <span className="text-foreground">{input.title}</span>
            <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </div>
        </TaskTrigger>
        <TaskContent>{input.children}</TaskContent>
      </Task>
    </div>
  );
}

function EntryFiles(input: {
  files: Array<{
    path: string;
    changeKind: string;
  }>;
}) {
  if (input.files.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Files</p>
      <div className="flex flex-wrap gap-2">
        {input.files.map((file) => (
          <Badge key={`${file.path}:${file.changeKind}`} variant="secondary">
            {file.changeKind} · {file.path}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function TranscriptMetaRow(input: {
  items: Array<ReactNode | null>;
}) {
  const items = input.items.filter((item): item is ReactNode => item !== null);

  return (
    <div className="flex flex-wrap items-center text-xs text-muted-foreground">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <Separator
              orientation="vertical"
              className="mx-2 h-4 !w-[2px] !self-center"
            />
          ) : null}
          <span className="font-medium">{item}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function buildReasoningLabel(entry: ReasoningEntry): string {
  return entry.segmentCount > 1 ? `${entry.segmentCount} reasoning` : "Reasoning";
}

function buildPiReadTaskTitle(entry: PiReadTaskEntry): string {
  return entry.readCount > 1 ? `pi.read · ${entry.readCount} files` : "pi.read · 1 file";
}

function buildPiEditTaskTitle(entry: PiEditTaskEntry): string {
  return entry.editCount > 1 ? `pi.edit · ${entry.editCount} files` : "pi.edit · 1 file";
}

function buildPiWriteTaskTitle(entry: PiWriteTaskEntry): string {
  return entry.writeCount > 1 ? `pi.write · ${entry.writeCount} files` : "pi.write · 1 file";
}

function buildPiGrepTaskTitle(entry: PiGrepTaskEntry): string {
  return entry.grepCount > 1 ? `pi.grep · ${entry.grepCount} searches` : "pi.grep · 1 search";
}

function buildPiFindTaskTitle(entry: PiFindTaskEntry): string {
  return entry.findCount > 1 ? `pi.find · ${entry.findCount} searches` : "pi.find · 1 search";
}

function formatPiEditLineCount(lineCount: number): string {
  return lineCount === 1 ? "1 line edited" : `${lineCount} lines edited`;
}

function formatPiWriteLineCount(lineCount: number): string {
  return lineCount === 1 ? "1 line written" : `${lineCount} lines written`;
}

function formatTimeoutSeconds(timeoutSeconds: number): string {
  return `${formatCount(timeoutSeconds)}-second timeout`;
}
