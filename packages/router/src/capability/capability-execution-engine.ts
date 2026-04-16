import type {
  WorkflowCapabilityExecutionCommand,
  WorkflowCapabilityExecutionEngine,
  WorkflowCapabilityExecutionResult,
  WorkflowCapabilityId,
  WorkflowEvidenceId,
  WorkflowModelProfileId,
  WorkflowTicketExecutionContract
} from "../types/index.js";

export async function executeWorkflowCapabilityCommand<
  Contract extends WorkflowTicketExecutionContract = WorkflowTicketExecutionContract,
  CapabilityId extends WorkflowCapabilityId = WorkflowCapabilityId,
  EvidenceId extends WorkflowEvidenceId = WorkflowEvidenceId,
  ProfileId extends WorkflowModelProfileId = WorkflowModelProfileId,
>(input: {
  engine: WorkflowCapabilityExecutionEngine<
    Contract,
    CapabilityId,
    EvidenceId,
    ProfileId
  >;
  command: WorkflowCapabilityExecutionCommand<Contract, CapabilityId, ProfileId>;
}): Promise<WorkflowCapabilityExecutionResult<CapabilityId, EvidenceId, ProfileId>> {
  return input.engine.execute(input.command);
}
