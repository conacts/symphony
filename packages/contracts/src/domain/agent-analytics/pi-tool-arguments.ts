/**
 * Pi tool argument types — canonical source of truth.
 *
 * These types are derived directly from the pi-coding-agent tool definitions
 * (which use TypeBox schemas at runtime).  We mirror the shapes here as Zod
 * schemas so that the analytics pipeline can validate raw arguments at the
 * ingestion boundary and store structured fields in typed database columns.
 *
 * When pi adds or changes a tool, update the corresponding schema here and
 * add a migration.
 */

import { z } from "zod";
import { nonEmptyStringSchema } from "../../core/shared.js";

// ---------------------------------------------------------------------------
// Re-exported type aliases — one canonical place for downstream consumers
// ---------------------------------------------------------------------------

/** pi.read  —  { path, offset?, limit? } */
export type PiReadArguments = {
  path: string;
  offset?: number;
  limit?: number;
};

/** pi.edit  —  { path, edits: Array<{ oldText, newText }> } */
export type PiEditArguments = {
  path: string;
  edits: Array<PiEditBlock>;
};

export type PiEditBlock = {
  oldText: string;
  newText: string;
};

/** pi.write  —  { path, content } */
export type PiWriteArguments = {
  path: string;
  content: string;
};

/** pi.bash  —  { command, timeout? } */
export type PiBashArguments = {
  command: string;
  timeout?: number;
};

/** pi.grep  —  { pattern, path?, glob?, ignoreCase?, literal?, context?, limit? } */
export type PiGrepArguments = {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
};

/** pi.find  —  { pattern, path?, limit? } */
export type PiFindArguments = {
  pattern: string;
  path?: string;
  limit?: number;
};

/** pi.ls  —  { path?, limit? } */
export type PiLsArguments = {
  path?: string;
  limit?: number;
};

/** Every built-in pi tool that has typed argument shapes. */
export type KnownPiToolName =
  | "read"
  | "edit"
  | "write"
  | "bash"
  | "grep"
  | "find"
  | "ls";

// ---------------------------------------------------------------------------
// Zod schemas — used at the analytics ingestion boundary to validate raw args
// ---------------------------------------------------------------------------

export const piEditBlockSchema = z.preprocess(
  normalizePiEditBlock,
  z.strictObject({
    oldText: z.string(),
    newText: z.string()
  })
);

export const piReadArgumentsSchema = z.strictObject({
  path: nonEmptyStringSchema,
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional()
});

export const piEditArgumentsSchema = z.preprocess(
  normalizePiEditArguments,
  z.strictObject({
    path: nonEmptyStringSchema,
    edits: z.array(piEditBlockSchema).min(1)
  })
);

export const piWriteArgumentsSchema = z.preprocess(
  normalizePiWriteArguments,
  z.strictObject({
    path: nonEmptyStringSchema,
    content: z.string()
  })
);

export const piBashArgumentsSchema = z.strictObject({
  command: z.string(),
  timeout: z.number().int().nonnegative().optional()
});

export const piGrepArgumentsSchema = z.strictObject({
  pattern: z.string(),
  path: nonEmptyStringSchema.optional(),
  glob: z.string().optional(),
  ignoreCase: z.boolean().optional(),
  literal: z.boolean().optional(),
  context: z.number().int().nonnegative().optional(),
  limit: z.number().int().nonnegative().optional()
});

export const piFindArgumentsSchema = z.strictObject({
  pattern: z.string(),
  path: nonEmptyStringSchema.optional(),
  limit: z.number().int().nonnegative().optional()
});

export const piLsArgumentsSchema = z.strictObject({
  path: nonEmptyStringSchema.optional(),
  limit: z.number().int().nonnegative().optional()
});

// ---------------------------------------------------------------------------
// Parse helper
// ---------------------------------------------------------------------------

/**
 * Attempt to parse raw arguments into the typed shape for a known pi tool.
 *
 * Returns `null` when the tool name is unknown or the arguments do not
 * conform to the expected schema.  This is intentionally a *safe* parse
 * — it never throws, so callers can degrade gracefully to the raw JSON
 * column when structured extraction fails.
 */
export function parseKnownPiToolArguments(
  toolName: string,
  rawArguments: unknown
): PiReadArguments | PiEditArguments | PiWriteArguments | PiBashArguments | PiGrepArguments | PiFindArguments | PiLsArguments | null {
  const schema = piToolSchemaByTool[toolName as KnownPiToolName];
  if (!schema) {
    return null;
  }

  const result = (schema as z.ZodType<unknown>).safeParse(rawArguments);
  return result.success ? (result.data as PiReadArguments | PiEditArguments | PiWriteArguments | PiBashArguments | PiGrepArguments | PiFindArguments | PiLsArguments) : null;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

const piToolSchemaByTool: Record<KnownPiToolName, z.ZodType<unknown>> = {
  read: piReadArgumentsSchema,
  edit: piEditArgumentsSchema,
  write: piWriteArgumentsSchema,
  bash: piBashArgumentsSchema,
  grep: piGrepArgumentsSchema,
  find: piFindArgumentsSchema,
  ls: piLsArgumentsSchema
};

function normalizePiEditArguments(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    path: record.path,
    edits: Array.isArray(record.edits) ? record.edits.map(normalizePiEditBlock) : record.edits
  };
}

function normalizePiEditBlock(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    oldText: getAliasString(record, ["oldText", "old_text", "oldString", "old_string"]),
    newText: getAliasString(record, ["newText", "new_text", "newString", "new_string"])
  };
}

function normalizePiWriteArguments(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as Record<string, unknown>;
  return {
    path: record.path,
    content: getAliasString(record, ["content", "text", "fileText", "file_text"])
  };
}

function getAliasString(
  record: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }

  return record[keys[0] ?? ""];
}
