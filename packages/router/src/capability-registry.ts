import { WorkflowModelProfileRegistry } from "./model-profile-registry.js";
import type {
  WorkflowCapabilityDefinition,
  WorkflowModelProfileDefinition,
  WorkflowModelProfileId
} from "./types/index.js";

type WorkflowCapabilityDefinitionLike = WorkflowCapabilityDefinition<
  string,
  string,
  string
>;

export class WorkflowCapabilityRegistry<
  Definition extends WorkflowCapabilityDefinitionLike,
> {
  readonly #definitionsById: Map<Definition["id"], Definition>;
  readonly #modelProfileRegistry: WorkflowModelProfileRegistry<
    WorkflowModelProfileDefinition<WorkflowModelProfileId>
  >;

  constructor(input: {
    definitions: Definition[];
    modelProfileRegistry: WorkflowModelProfileRegistry<
      WorkflowModelProfileDefinition<WorkflowModelProfileId>
    >;
  }) {
    if (input.definitions.length === 0) {
      throw new TypeError(
        "Workflow capability registry requires at least one capability definition."
      );
    }

    this.#modelProfileRegistry = input.modelProfileRegistry;
    const definitionsById = new Map<Definition["id"], Definition>();

    for (const definition of input.definitions) {
      const capabilityId = definition.id.trim();
      if (capabilityId.length === 0) {
        throw new TypeError("Workflow capability id is required.");
      }

      if (definitionsById.has(definition.id)) {
        throw new TypeError(
          `Duplicate workflow capability id ${JSON.stringify(definition.id)}.`
        );
      }

      if (definition.supportedModelProfileIds.length === 0) {
        throw new TypeError(
          `Workflow capability ${JSON.stringify(definition.id)} must declare at least one supported model profile.`
        );
      }

      for (const profileId of definition.supportedModelProfileIds) {
        if (!this.#modelProfileRegistry.hasProfileId(profileId)) {
          throw new TypeError(
            `Workflow capability ${JSON.stringify(definition.id)} references unsupported model profile ${JSON.stringify(profileId)}.`
          );
        }
      }

      definitionsById.set(definition.id, definition);
    }

    this.#definitionsById = definitionsById;
  }

  listCapabilityIds(): Definition["id"][] {
    return [...this.#definitionsById.keys()];
  }

  listCapabilityDefinitions(): Definition[] {
    return [...this.#definitionsById.values()];
  }

  hasCapabilityId(capabilityId: string): capabilityId is Definition["id"] {
    return this.#definitionsById.has(capabilityId as Definition["id"]);
  }

  requireCapabilityId(capabilityId: string): asserts capabilityId is Definition["id"] {
    if (this.hasCapabilityId(capabilityId)) {
      return;
    }

    throw new TypeError(
      `Unknown workflow capability ${JSON.stringify(capabilityId)}. Expected one of ${this.listCapabilityIds()
        .map((registeredCapabilityId) => JSON.stringify(registeredCapabilityId))
        .join(", ")}.`
    );
  }

  getCapabilityDefinition(capabilityId: Definition["id"]): Definition {
    const definition = this.#definitionsById.get(capabilityId);
    if (!definition) {
      throw new TypeError(
        `Workflow capability ${JSON.stringify(capabilityId)} is not registered.`
      );
    }

    return definition;
  }
}

export function createWorkflowCapabilityRegistry<
  const Definitions extends readonly WorkflowCapabilityDefinitionLike[],
>(
  input: {
    definitions: Definitions;
    modelProfileRegistry: WorkflowModelProfileRegistry<
      WorkflowModelProfileDefinition<WorkflowModelProfileId>
    >;
  }
): WorkflowCapabilityRegistry<Definitions[number]> {
  return new WorkflowCapabilityRegistry({
    definitions: [...input.definitions],
    modelProfileRegistry: input.modelProfileRegistry
  });
}
