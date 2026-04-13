import type {
  WorkflowModelProfileDefinition
} from "./types/index.js";

type WorkflowModelProfileDefinitionLike = WorkflowModelProfileDefinition<string>;

export class WorkflowModelProfileRegistry<
  Definition extends WorkflowModelProfileDefinitionLike,
> {
  readonly #definitionsById: Map<Definition["id"], Definition>;

  constructor(definitions: Definition[]) {
    if (definitions.length === 0) {
      throw new TypeError(
        "Workflow model profile registry requires at least one profile definition."
      );
    }

    const definitionsById = new Map<Definition["id"], Definition>();

    for (const definition of definitions) {
      const profileId = definition.id.trim();
      if (profileId.length === 0) {
        throw new TypeError("Workflow model profile id is required.");
      }

      if (definitionsById.has(definition.id)) {
        throw new TypeError(
          `Duplicate workflow model profile id ${JSON.stringify(definition.id)}.`
        );
      }

      definitionsById.set(definition.id, definition);
    }

    this.#definitionsById = definitionsById;
  }

  listProfileIds(): Definition["id"][] {
    return [...this.#definitionsById.keys()];
  }

  listProfileDefinitions(): Definition[] {
    return [...this.#definitionsById.values()];
  }

  hasProfileId(profileId: string): profileId is Definition["id"] {
    return this.#definitionsById.has(profileId as Definition["id"]);
  }

  requireProfileId(profileId: string): asserts profileId is Definition["id"] {
    if (this.hasProfileId(profileId)) {
      return;
    }

    throw new TypeError(
      `Unknown workflow model profile ${JSON.stringify(profileId)}. Expected one of ${this.listProfileIds()
        .map((registeredProfileId) => JSON.stringify(registeredProfileId))
        .join(", ")}.`
    );
  }

  getProfileDefinition(profileId: Definition["id"]): Definition {
    const definition = this.#definitionsById.get(profileId);
    if (!definition) {
      throw new TypeError(
        `Workflow model profile ${JSON.stringify(profileId)} is not registered.`
      );
    }

    return definition;
  }
}

export function createWorkflowModelProfileRegistry<
  const Definitions extends readonly WorkflowModelProfileDefinitionLike[],
>(
  definitions: Definitions
): WorkflowModelProfileRegistry<Definitions[number]> {
  return new WorkflowModelProfileRegistry([...definitions]);
}
