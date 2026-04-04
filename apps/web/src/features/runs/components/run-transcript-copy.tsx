"use client";

import React, { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function RunTranscriptCopy(input: ComponentProps<"div">) {
  const { children, className, ...props } = input;

  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words text-sm leading-6 text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
