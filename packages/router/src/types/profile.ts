export type WorkflowModelProfileId = string;

export type WorkflowModelProfileDefinition<
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
> = {
  id: ProfileId;
  label: string;
  description: string | null;
};
