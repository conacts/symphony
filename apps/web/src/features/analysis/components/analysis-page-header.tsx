import React from "react";

export function AnalysisPageHeader(input: {
  eyebrow: string;
  title: string;
  description: string;
  focus: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
        {input.eyebrow}
      </p>
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{input.title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {input.description}
        </p>
      </div>
      <p className="text-sm text-foreground/85">{input.focus}</p>
    </div>
  );
}
