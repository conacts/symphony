export {
  ERROR_MESSAGES,
  getErrorMessage,
  createAppError,
  isAppError,
  fromZodError,
  tryParseAppError,
  toAppError,
  errorCodeSchema,
  appErrorSchema
} from "./core/codes.js";
export type { ErrorCode, AppError } from "./core/codes.js";
export type { Envelope, EnvelopeMeta, EnvelopeMetaLine } from "./response-envelope.js";
export {
  envelopeMetaSchema,
  unknownEnvelopeSchema,
  createEnvelopeSchema
} from "./response-envelope-schema.js";
export type { EnvelopeSchema } from "./response-envelope-schema.js";
