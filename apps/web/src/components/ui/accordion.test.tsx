import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";

describe("accordion", () => {
  it("does not pin content to the initial measured radix height", () => {
    const html = renderToStaticMarkup(
      <Accordion type="single" collapsible defaultValue="item-1">
        <AccordionItem value="item-1">
          <AccordionTrigger>Section</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>
    );

    expect(html).toContain("data-slot=\"accordion-content\"");
    expect(html).not.toContain("h-(--radix-accordion-content-height)");
  });
});
