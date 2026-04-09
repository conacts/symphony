type RuntimeToolApiResult = {
  success: boolean;
  output: string;
  contentItems: Array<{
    type: "inputText";
    text: string;
  }>;
};

export async function postRuntimeToolRequest(input: {
  apiBaseUrl: string;
  endpoint: string;
  runId: string;
  turnId: string | null;
  issue: {
    trackerIssueId: string;
    identifier: string;
    state: string | null;
  };
  argumentsPayload: unknown;
}): Promise<RuntimeToolApiResult> {
  const response = await fetch(`${input.apiBaseUrl}/${input.endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      runId: input.runId,
      turnId: input.turnId,
      issue: input.issue,
      arguments: input.argumentsPayload
    })
  });

  const body = (await response.json()) as {
    ok?: boolean;
    data?: RuntimeToolApiResult;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !body.ok || !body.data) {
    throw new Error(
      body.error?.message ??
        `Symphony runtime tools API request failed with status ${response.status}.`
    );
  }

  return body.data;
}
