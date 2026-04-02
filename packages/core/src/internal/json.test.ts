import { describe, expect, it } from "vitest";
import {
  asJsonObject,
  normalizeUnknownJsonObject,
  normalizeUnknownJsonValue
} from "./json.js";

describe("internal json helpers", () => {
  it("normalizes nested unknown values into json-safe data", () => {
    const normalized = normalizeUnknownJsonValue({
      ok: true,
      nested: [1, "two", Symbol("tag")],
      map: {
        set: new Set([1, 2])
      }
    });

    expect(normalized).toEqual({
      ok: true,
      nested: [1, "two", "Symbol(tag)"],
      map: {
        set: {}
      }
    });
  });

  it("returns json objects only for object-like inputs", () => {
    expect(asJsonObject(null)).toBeNull();
    expect(asJsonObject(["value"])).toBeNull();
    expect(normalizeUnknownJsonObject({
      issueId: "issue-1"
    })).toEqual({
      issueId: "issue-1"
    });
  });
});
