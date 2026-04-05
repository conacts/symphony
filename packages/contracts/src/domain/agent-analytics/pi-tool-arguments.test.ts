import { describe, expect, it } from "vitest";
import {
  parseKnownPiToolArguments,
  piEditArgumentsSchema,
  piGrepArgumentsSchema,
  piReadArgumentsSchema,
  piWriteArgumentsSchema
} from "./pi-tool-arguments.js";

describe("pi tool argument schemas", () => {
  describe("piReadArgumentsSchema", () => {
    it("accepts valid read arguments", () => {
      const result = piReadArgumentsSchema.safeParse({
        path: "src/index.ts",
        offset: 100,
        limit: 50
      });
      expect(result.success).toBe(true);
    });

    it("accepts read with only required fields", () => {
      const result = piReadArgumentsSchema.safeParse({ path: "README.md" });
      expect(result.success).toBe(true);
    });

    it("rejects missing path", () => {
      const result = piReadArgumentsSchema.safeParse({ offset: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe("piEditArgumentsSchema", () => {
    it("accepts valid edit arguments", () => {
      const result = piEditArgumentsSchema.safeParse({
        path: "src/index.ts",
        edits: [{ oldText: "before", newText: "after" }]
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty edits array", () => {
      const result = piEditArgumentsSchema.safeParse({
        path: "src/index.ts",
        edits: []
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing edits", () => {
      const result = piEditArgumentsSchema.safeParse({ path: "src/index.ts" });
      expect(result.success).toBe(false);
    });

    it("accepts aliased edit text fields", () => {
      const result = piEditArgumentsSchema.safeParse({
        path: "src/index.ts",
        edits: [{ old_text: "before", new_string: "after" }]
      });
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected aliased edit arguments to parse");
      }
      expect(result.data.edits).toEqual([{ oldText: "before", newText: "after" }]);
    });
  });

  describe("piWriteArgumentsSchema", () => {
    it("accepts valid write arguments", () => {
      const result = piWriteArgumentsSchema.safeParse({
        path: "output.md",
        content: "hello world"
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing content", () => {
      const result = piWriteArgumentsSchema.safeParse({ path: "output.md" });
      expect(result.success).toBe(false);
    });

    it("accepts aliased write content fields", () => {
      const result = piWriteArgumentsSchema.safeParse({
        path: "output.md",
        file_text: "hello\nworld"
      });
      expect(result.success).toBe(true);
      if (!result.success) {
        throw new Error("Expected aliased write arguments to parse");
      }
      expect(result.data.content).toBe("hello\nworld");
    });
  });

  describe("piGrepArgumentsSchema", () => {
    it("accepts valid grep arguments", () => {
      const result = piGrepArgumentsSchema.safeParse({
        pattern: "TODO",
        path: "src",
        ignoreCase: true
      });
      expect(result.success).toBe(true);
    });

    it("accepts pattern only", () => {
      const result = piGrepArgumentsSchema.safeParse({ pattern: "FIXME" });
      expect(result.success).toBe(true);
    });
  });
});

describe("parseKnownPiToolArguments", () => {
  it("parses pi.read arguments", () => {
    const result = parseKnownPiToolArguments("read", {
      path: "src/index.ts",
      offset: 10
    });
    expect(result).not.toBeNull();
    if (result && "path" in result) {
      expect(result.path).toBe("src/index.ts");
    } else {
      throw new Error("Expected read arguments");
    }
  });

  it("parses pi.edit arguments", () => {
    const result = parseKnownPiToolArguments("edit", {
      path: "src/app.tsx",
      edits: [{ oldText: "a", newText: "b" }, { oldText: "c", newText: "d" }]
    });
    expect(result).not.toBeNull();
    if (result && "edits" in result) {
      expect(result.path).toBe("src/app.tsx");
      expect(result.edits).toHaveLength(2);
    } else {
      throw new Error("Expected edit arguments");
    }
  });

  it("parses pi.write arguments", () => {
    const result = parseKnownPiToolArguments("write", {
      path: "output.md",
      content: "hello"
    });
    expect(result).not.toBeNull();
    if (result && "content" in result) {
      expect(result.path).toBe("output.md");
      expect(result.content).toBe("hello");
    } else {
      throw new Error("Expected write arguments");
    }
  });

  it("normalizes aliased pi.edit arguments", () => {
    const result = parseKnownPiToolArguments("edit", {
      path: "src/app.tsx",
      edits: [{ old_string: "const a = 1;", new_text: "const a = 2;" }]
    });
    expect(result).not.toBeNull();
    if (result && "edits" in result) {
      expect(result.edits).toEqual([
        {
          oldText: "const a = 1;",
          newText: "const a = 2;"
        }
      ]);
    } else {
      throw new Error("Expected normalized edit arguments");
    }
  });

  it("normalizes aliased pi.write arguments", () => {
    const result = parseKnownPiToolArguments("write", {
      path: "output.md",
      fileText: "hello\nworld"
    });
    expect(result).not.toBeNull();
    if (result && "content" in result) {
      expect(result.content).toBe("hello\nworld");
    } else {
      throw new Error("Expected normalized write arguments");
    }
  });

  it("returns null for unknown tool name", () => {
    const result = parseKnownPiToolArguments("unknown_tool", { path: "x" });
    expect(result).toBeNull();
  });

  it("returns null for invalid arguments shape", () => {
    const result = parseKnownPiToolArguments("edit", { wrong: "shape" });
    expect(result).toBeNull();
  });

  it("returns null for null arguments", () => {
    const result = parseKnownPiToolArguments("read", null);
    expect(result).toBeNull();
  });
});
