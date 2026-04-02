import type {
  SymphonyNormalizedRuntimeManifest,
  SymphonyRuntimeManifest
} from "./runtime-manifest-contract.js";
import { symphonyRuntimeManifestBrand } from "./runtime-manifest-validation-shared.js";
import { normalizeSymphonyRuntimeManifest } from "./runtime-manifest-validation.js";
import { isRecord } from "../internal/records.js";

type BrandedSymphonyRuntimeManifest = SymphonyNormalizedRuntimeManifest & {
  readonly [symphonyRuntimeManifestBrand]: true;
};

export function defineSymphonyRuntime(
  input: SymphonyRuntimeManifest
): SymphonyNormalizedRuntimeManifest {
  return brandSymphonyRuntimeManifest(normalizeSymphonyRuntimeManifest(input));
}

export function brandSymphonyRuntimeManifest(
  manifest: SymphonyNormalizedRuntimeManifest
): SymphonyNormalizedRuntimeManifest {
  Object.defineProperty(manifest, symphonyRuntimeManifestBrand, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });

  return deepFreeze(manifest);
}

export function isDefinedSymphonyRuntimeManifest(
  value: unknown
): value is BrandedSymphonyRuntimeManifest {
  if (!isRecord(value)) {
    return false;
  }

  const brandedValue = value as Record<PropertyKey, unknown>;
  return brandedValue[symphonyRuntimeManifestBrand] === true;
}

function deepFreeze<T>(value: T): T {
  if (!isFreezable(value)) {
    return value;
  }

  const record = value as Record<PropertyKey, unknown>;
  for (const property of Reflect.ownKeys(value)) {
    const nestedValue = record[property];
    if (isFreezable(nestedValue)) {
      deepFreeze(nestedValue);
    }
  }

  return Object.freeze(value);
}

function isFreezable(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    (typeof value === "object" && value !== null) ||
    typeof value === "function"
  );
}
