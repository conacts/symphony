import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatDiffForDisplay,
  RunTranscriptTaskDiffPreview
} from "@/features/runs/components/run-transcript-task-diff-preview";

describe("run transcript task diff preview", () => {
  it("normalizes escaped newlines into a displayable diff", () => {
    expect(
      formatDiffForDisplay(
        "--- a/src/app/page.tsx\\n+++ b/src/app/page.tsx\\n@@ -1 +1 @@\\n-old\\n+new"
      )
    ).toBe([
      "--- a/src/app/page.tsx",
      "+++ b/src/app/page.tsx",
      "@@ -1 +1 @@",
      "-old",
      "+new"
    ].join("\n"));
  });

  it("renders an eight-line preview with an expand control for longer diffs", () => {
    const diffText = [
      "--- a/src/app/layout.tsx",
      "+++ b/src/app/layout.tsx",
      "@@ -1,8 +1,10 @@",
      " export default function RootLayout({ children }) {",
      "-  return <html><body>{children}</body></html>;",
      "+  return <html lang=\"en\">",
      "+    <body>{children}</body>",
      "+  </html>;",
      " }",
      "+export const metadata = {};",
      "+export const viewport = {};"
    ].join("\n");

    const html = renderToStaticMarkup(
      <RunTranscriptTaskDiffPreview diffText={diffText} />
    );

    expect(html).toContain("--- a/src/app/layout.tsx");
    expect(html).toContain("+  &lt;/html&gt;;");
    expect(html).not.toContain("+export const metadata = {};");
    expect(html).not.toContain("+export const viewport = {};");
    expect(html).toContain("Show full diff (11 lines)");
  });
});
