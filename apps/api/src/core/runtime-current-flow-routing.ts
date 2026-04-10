import {
  createSymphonyCurrentFlowRouterAsync,
  type SymphonyCurrentFlowData,
  type SymphonyCurrentFlowNode,
  type SymphonyCurrentFlowPolicy,
  type WorkflowRouter
} from "@symphony/router";
import type { SymphonyTrackerConfig } from "@symphony/tracker";

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
  trackerConfig: SymphonyTrackerConfig;
  now?: () => Date;
  router?: SymphonyRuntimeCurrentFlowRouter;
  policy?: SymphonyCurrentFlowPolicy;
}): Promise<SymphonyRuntimeCurrentFlowRouting> {
  assertCurrentFlowTrackerContract(input.trackerConfig);

  return {
    router:
      input.router ??
      (await createSymphonyCurrentFlowRouterAsync({
        now: input.now
      })),
    policy: input.policy ?? symphonyCurrentFlowPolicy
  };
}

function assertCurrentFlowTrackerContract(
  trackerConfig: SymphonyTrackerConfig
): void {
  assertTrackerStateValue(
    "claimTransitionToState",
    trackerConfig.claimTransitionToState,
    "Bootstrapping"
  );
  assertTrackerStateValue(
    "startupFailureTransitionToState",
    trackerConfig.startupFailureTransitionToState,
    "Failed"
  );
  assertTrackerStateValue(
    "pauseTransitionToState",
    trackerConfig.pauseTransitionToState,
    "Paused"
  );
  assertTrackerStateValue(
    "blockedTransitionToState",
    trackerConfig.blockedTransitionToState,
    "Blocked"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Todo"
  );
  assertTrackerStateIncluded(
    "claimTransitionFromStates",
    trackerConfig.claimTransitionFromStates,
    "Rework"
  );
}

function assertTrackerStateValue(
  fieldName: string,
  value: string | null,
  expected: string
): void {
  if (value === expected) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to be ${JSON.stringify(expected)}. Received ${JSON.stringify(value)}.`
  );
}

function assertTrackerStateIncluded(
  fieldName: string,
  states: string[],
  expectedState: string
): void {
  if (states.includes(expectedState)) {
    return;
  }

  throw new TypeError(
    `Current-flow routing requires tracker.${fieldName} to include ${JSON.stringify(expectedState)}. Received ${JSON.stringify(states)}.`
  );
}
