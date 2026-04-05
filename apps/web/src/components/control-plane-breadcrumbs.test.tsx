import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ControlPlaneBreadcrumbs } from "@/features/shared/components/control-plane-breadcrumbs";

describe("control plane breadcrumbs", () => {
  it("renders a compact trail with an ellipsis for deeper routes", () => {
    const html = renderToStaticMarkup(
      <ControlPlaneBreadcrumbs
        items={[
          { label: "Issues", href: "/issues" },
          { label: "COL-184", href: "/issues/COL-184" },
          { label: "09cacfc1", href: "/issues/COL-184/runs/09cacfc1" },
          { label: "Turns", href: "/issues/COL-184/runs/09cacfc1/turns" },
          { label: "Turn 1" }
        ]}
      />
    );

    expect(html).toContain("Issues");
    expect(html).toContain("Turn 1");
    expect(html).toContain("data-slot=\"breadcrumb-ellipsis\"");
  });
});
