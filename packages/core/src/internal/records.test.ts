import { describe, expect, it } from "vitest";
import {
  asRecord,
  getArrayPath,
  getBooleanPath,
  getPath,
  getRecord,
  getRecordPath,
  getString,
  getStringPath,
  isRecord,
  readString
} from "./records.js";

describe("internal record helpers", () => {
  it("guards object-like records without accepting arrays", () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord(["nope"])).toBe(false);
    expect(asRecord({ ok: true })).toEqual({
      ok: true
    });
    expect(asRecord(["nope"])).toBeNull();
  });

  it("reads nested record paths without casts at call sites", () => {
    const value = {
      issue: {
        state: {
          name: "Todo"
        },
        labels: {
          nodes: [
            {
              name: "bug"
            }
          ]
        },
        flags: {
          blocked: true
        }
      }
    };

    expect(getRecord(value, "issue")).toEqual(value.issue);
    expect(getRecordPath(value, ["issue", "state"])).toEqual(value.issue.state);
    expect(getPath(value, ["issue", "state", "name"])).toBe("Todo");
    expect(getString(value.issue, "missing")).toBeNull();
    expect(getStringPath(value, ["issue", "state", "name"])).toBe("Todo");
    expect(getArrayPath(value, ["issue", "labels", "nodes"])).toEqual(
      value.issue.labels.nodes
    );
    expect(getBooleanPath(value, ["issue", "flags", "blocked"])).toBe(true);
  });

  it("rejects blank string reads", () => {
    expect(readString("value")).toBe("value");
    expect(readString("   ")).toBeNull();
    expect(readString(1)).toBeNull();
  });
});
