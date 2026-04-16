import {
  createSymphonyIntelligentFlowModuleDefinition,
  createSymphonyIntelligentFlowRuntimeSupport,
  isSymphonyIntelligentFlowModuleRuntimeSupported,
  listSymphonyIntelligentFlowDefaultModuleDefinitions,
  symphonyIntelligentFlowDefaultRuntimeSupport,
  type SymphonyIntelligentFlowEvidenceId,
  type SymphonyIntelligentFlowModuleDefinition,
  type SymphonyIntelligentFlowRuntimeSupport
} from "./symphony-intelligent-flow-contract.js";

type SymphonyIntelligentFlowModuleDefinitionLike =
  SymphonyIntelligentFlowModuleDefinition;

export class SymphonyIntelligentFlowModuleRegistry<
  Definition extends SymphonyIntelligentFlowModuleDefinitionLike,
> {
  readonly #definitionsById: Map<Definition["id"], Definition>;
  readonly #evidenceProducerIdsByEvidenceId: Map<
    SymphonyIntelligentFlowEvidenceId,
    Definition["id"][]
  >;
  readonly #runtimeSupport: SymphonyIntelligentFlowRuntimeSupport;

  constructor(input: {
    definitions: Definition[];
    runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
  }) {
    if (input.definitions.length === 0) {
      throw new TypeError(
        "Intelligent-flow module registry requires at least one module definition."
      );
    }

    this.#runtimeSupport = normalizeRuntimeSupport(
      input.runtimeSupport ?? symphonyIntelligentFlowDefaultRuntimeSupport
    );

    const definitionsById = new Map<Definition["id"], Definition>();
    const evidenceProducerIdsByEvidenceId = new Map<
      SymphonyIntelligentFlowEvidenceId,
      Definition["id"][]
    >();

    for (const rawDefinition of input.definitions) {
      const definition = createSymphonyIntelligentFlowModuleDefinition(
        rawDefinition
      ) as Definition;
      if (definitionsById.has(definition.id)) {
        throw new TypeError(
          `Duplicate intelligent-flow module id ${JSON.stringify(definition.id)}.`
        );
      }

      definitionsById.set(definition.id, definition);

      for (const evidenceId of definition.producesEvidenceIds) {
        const producerIds = evidenceProducerIdsByEvidenceId.get(evidenceId) ?? [];
        producerIds.push(definition.id);
        evidenceProducerIdsByEvidenceId.set(evidenceId, producerIds);
      }
    }

    for (const definition of definitionsById.values()) {
      for (const evidenceId of definition.requiresEvidenceIds) {
        const producerIds = evidenceProducerIdsByEvidenceId.get(evidenceId) ?? [];
        if (producerIds.length === 0) {
          throw new TypeError(
            `Intelligent-flow module ${JSON.stringify(definition.id)} requires evidence ${JSON.stringify(evidenceId)} but no registered module produces it.`
          );
        }
      }
    }

    this.#definitionsById = definitionsById;
    this.#evidenceProducerIdsByEvidenceId = evidenceProducerIdsByEvidenceId;
  }

  listModuleIds(): Definition["id"][] {
    return [...this.#definitionsById.keys()];
  }

  listModuleDefinitions(): Definition[] {
    return [...this.#definitionsById.values()];
  }

  listAvailableModuleIds(input: {
    runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
  } = {}): Definition["id"][] {
    return this.listAvailableModuleDefinitions(input).map(
      (definition) => definition.id
    );
  }

  listAvailableModuleDefinitions(input: {
    runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
  } = {}): Definition[] {
    const runtimeSupport = this.#resolveRuntimeSupport(input.runtimeSupport);
    return this.listModuleDefinitions().filter(
      (definition) =>
        definition.enabledByDefault &&
        isSymphonyIntelligentFlowModuleRuntimeSupported(
          definition,
          runtimeSupport
        )
    );
  }

  hasModuleId(moduleId: string): moduleId is Definition["id"] {
    return this.#definitionsById.has(moduleId as Definition["id"]);
  }

  requireModuleId(moduleId: string): asserts moduleId is Definition["id"] {
    if (this.hasModuleId(moduleId)) {
      return;
    }

    throw new TypeError(
      `Unknown intelligent-flow module ${JSON.stringify(moduleId)}. Expected one of ${this.listModuleIds()
        .map((registeredModuleId) => JSON.stringify(registeredModuleId))
        .join(", ")}.`
    );
  }

  getModuleDefinition(moduleId: Definition["id"]): Definition {
    const definition = this.#definitionsById.get(moduleId);
    if (!definition) {
      throw new TypeError(
        `Intelligent-flow module ${JSON.stringify(moduleId)} is not registered.`
      );
    }

    return definition;
  }

  isModuleRuntimeSupported(input: {
    moduleId: Definition["id"];
    runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
  }): boolean {
    return isSymphonyIntelligentFlowModuleRuntimeSupported(
      this.getModuleDefinition(input.moduleId),
      this.#resolveRuntimeSupport(input.runtimeSupport)
    );
  }

  listEvidenceProducerDefinitions(
    evidenceId: SymphonyIntelligentFlowEvidenceId
  ): Definition[] {
    const producerIds = this.#evidenceProducerIdsByEvidenceId.get(evidenceId) ?? [];
    return producerIds.map((moduleId) => this.getModuleDefinition(moduleId));
  }

  listAvailableEvidenceProducerDefinitions(
    evidenceId: SymphonyIntelligentFlowEvidenceId,
    input: {
      runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
    } = {}
  ): Definition[] {
    const availableModuleIds = new Set(this.listAvailableModuleIds(input));
    return this.listEvidenceProducerDefinitions(evidenceId).filter((definition) =>
      availableModuleIds.has(definition.id)
    );
  }

  #resolveRuntimeSupport(
    runtimeSupport: SymphonyIntelligentFlowRuntimeSupport | null | undefined
  ): SymphonyIntelligentFlowRuntimeSupport {
    return normalizeRuntimeSupport(runtimeSupport ?? this.#runtimeSupport);
  }
}

export function createSymphonyIntelligentFlowModuleRegistry<
  const Definitions extends readonly SymphonyIntelligentFlowModuleDefinitionLike[],
>(input: {
  definitions: Definitions;
  runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
}): SymphonyIntelligentFlowModuleRegistry<Definitions[number]> {
  return new SymphonyIntelligentFlowModuleRegistry({
    definitions: [...input.definitions],
    runtimeSupport: input.runtimeSupport ?? null
  });
}

export function createSymphonyIntelligentFlowDefaultModuleRegistry(input: {
  runtimeSupport?: SymphonyIntelligentFlowRuntimeSupport | null;
} = {}): SymphonyIntelligentFlowModuleRegistry<SymphonyIntelligentFlowModuleDefinition> {
  return createSymphonyIntelligentFlowModuleRegistry({
    definitions: listSymphonyIntelligentFlowDefaultModuleDefinitions(),
    runtimeSupport: input.runtimeSupport ?? symphonyIntelligentFlowDefaultRuntimeSupport
  });
}

function normalizeRuntimeSupport(
  runtimeSupport: SymphonyIntelligentFlowRuntimeSupport
): SymphonyIntelligentFlowRuntimeSupport {
  return createSymphonyIntelligentFlowRuntimeSupport(runtimeSupport);
}
