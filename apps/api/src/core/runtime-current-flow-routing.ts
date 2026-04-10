import {
  createSymphonyCurrentFlowRouterAsync,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";

export type SymphonyRuntimeCurrentFlowRouter = WorkflowRouter<
  SymphonyCurrentFlowNode,
  SymphonyCurrentFlowData,
  SymphonyCurrentFlowPolicy
>;

export type SymphonyRuntimeCurrentFlowRouting = {
  router: SymphonyRuntimeCurrentFlowRouter;
  policy: SymphonyCurrentFlowPolicy;
};

const symphonyCurrentFlowPolicy = Object.freeze({}) as SymphonyCurrentFlowPolicy;

export async function createRuntimeCurrentFlowRouting(input: {
  now?: () => Date;
  router?: SymphonyRuntimeCurrentFlowRouter;
  policy?: SymphonyCurrentFlowPolicy;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  return {
    router:
      input.router ??
      (await createSymphonyCurrentFlowRouterAsync({
        now: input.now
      })),
    policy: input.policy ?? symphonyCurrentFlowPolicy
  };
}
