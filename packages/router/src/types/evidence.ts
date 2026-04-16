export type WorkflowEvidenceId = string;

export type WorkflowEvidenceArtifactReference = {
  label: string;
  uri: string | null;
};

export type WorkflowEvidenceRecord<
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
> = {
  evidenceId: EvidenceId;
  summary: string;
  artifacts: WorkflowEvidenceArtifactReference[];
};
