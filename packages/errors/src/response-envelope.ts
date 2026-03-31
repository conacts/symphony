import type { AppError } from "./core/codes.js";

export type EnvelopeMeta = {
  durationMs: number;
  generatedAt: string;
  count?: number;
};

export type EnvelopeBase = {
  schemaVersion: "1";
  warnings?: string[];
  meta: EnvelopeMeta;
};

export type EnvelopeOk<T> = EnvelopeBase & {
  ok: true;
  data: T;
  error?: never;
};

export type EnvelopeError = EnvelopeBase & {
  ok: false;
  error: AppError;
  data?: never;
};

export type Envelope<T = unknown> = EnvelopeOk<T> | EnvelopeError;

export type EnvelopeMetaLine = {
  type: "meta";
  ok: boolean;
  schemaVersion: "1";
  meta: EnvelopeMeta;
};
