export const SYMPHONY_LOGGER_PACKAGE_NAME = "@symphony/logger";

export const SYMPHONY_LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "silent"
] as const;

export type SymphonyLogLevel = (typeof SYMPHONY_LOG_LEVELS)[number];

export type SymphonyLogContext = Record<string, unknown>;

export type SymphonyLogEntry = {
  timestamp: string;
  level: Exclude<SymphonyLogLevel, "silent">;
  logger: string;
  message: string;
  pid: number;
  context?: Record<string, unknown>;
};

type SymphonyLogSink = (entry: SymphonyLogEntry) => void;

export type SymphonyLogger = {
  name: string;
  level: SymphonyLogLevel;
  child(context: SymphonyLogContext): SymphonyLogger;
  debug(message: string, context?: SymphonyLogContext): void;
  info(message: string, context?: SymphonyLogContext): void;
  warn(message: string, context?: SymphonyLogContext): void;
  error(message: string, context?: SymphonyLogContext): void;
};

const levelPriority: Record<SymphonyLogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50
};

export function resolveSymphonyLogLevel(
  input: string | null | undefined,
  fallback: SymphonyLogLevel = "info"
): SymphonyLogLevel {
  if (!input) {
    return fallback;
  }

  const normalized = input.trim().toLowerCase();

  if (
    SYMPHONY_LOG_LEVELS.includes(normalized as SymphonyLogLevel)
  ) {
    return normalized as SymphonyLogLevel;
  }

  return fallback;
}

export function createSymphonyLogger(input: {
  name: string;
  level?: SymphonyLogLevel;
  context?: SymphonyLogContext;
  sink?: SymphonyLogSink;
  now?: () => Date;
  pid?: number;
}): SymphonyLogger {
  const level = input.level ?? "info";
  const sink = input.sink ?? defaultLogSink;
  const now = input.now ?? (() => new Date());
  const pid = input.pid ?? process.pid;
  const baseContext = normalizeContext(input.context);

  function write(
    entryLevel: Exclude<SymphonyLogLevel, "silent">,
    message: string,
    context?: SymphonyLogContext
  ): void {
    if (!isEnabled(level, entryLevel)) {
      return;
    }

    const mergedContext = mergeContexts(baseContext, normalizeContext(context));
    sink({
      timestamp: now().toISOString(),
      level: entryLevel,
      logger: input.name,
      message,
      pid,
      ...(mergedContext ? { context: mergedContext } : {})
    });
  }

  return {
    name: input.name,
    level,
    child(context) {
      return createSymphonyLogger({
        name: input.name,
        level,
        sink,
        now,
        pid,
        context: mergeContexts(baseContext, normalizeContext(context))
      });
    },
    debug(message, context) {
      write("debug", message, context);
    },
    info(message, context) {
      write("info", message, context);
    },
    warn(message, context) {
      write("warn", message, context);
    },
    error(message, context) {
      write("error", message, context);
    }
  };
}

export function createSilentSymphonyLogger(
  name = "symphony"
): SymphonyLogger {
  return createSymphonyLogger({
    name,
    level: "silent",
    sink() {
      return;
    }
  });
}

function isEnabled(
  configuredLevel: SymphonyLogLevel,
  entryLevel: Exclude<SymphonyLogLevel, "silent">
): boolean {
  return levelPriority[entryLevel] >= levelPriority[configuredLevel];
}

function defaultLogSink(entry: SymphonyLogEntry): void {
  const line = `${JSON.stringify(entry)}\n`;

  if (entry.level === "warn" || entry.level === "error") {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

function mergeContexts(
  left?: Record<string, unknown>,
  right?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    ...left,
    ...right
  };
}

function normalizeContext(
  context: SymphonyLogContext | undefined
): Record<string, unknown> | undefined {
  if (!context) {
    return undefined;
  }

  const entries = Object.entries(context).flatMap(([key, value]) => {
    const normalized = normalizeValue(value, 0);

    return normalized === undefined ? [] : [[key, normalized] as const];
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeValue(value: unknown, depth: number): unknown {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return normalizeError(value, depth + 1);
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array(${value.length})]`;
    }

    return value.map((entry) => {
      const normalized = normalizeValue(entry, depth + 1);
      return normalized === undefined ? null : normalized;
    });
  }

  if (typeof value === "object") {
    if (depth >= 2) {
      return "[object]";
    }

    const normalizedObject: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      const normalized = normalizeValue(nestedValue, depth + 1);

      if (normalized !== undefined) {
        normalizedObject[key] = normalized;
      }
    }

    return normalizedObject;
  }

  return String(value);
}

function normalizeError(error: Error, depth: number): Record<string, unknown> {
  const normalizedError: Record<string, unknown> = {
    name: error.name,
    message: error.message
  };

  if (error.stack) {
    normalizedError.stack = error.stack;
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  const normalizedCause = normalizeValue(cause, depth + 1);

  if (normalizedCause !== undefined) {
    normalizedError.cause = normalizedCause;
  }

  return normalizedError;
}
