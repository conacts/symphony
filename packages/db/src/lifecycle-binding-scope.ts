export type SymphonyLifecycleBindingScope = {
  organizationId: string;
  linearWorkspaceIdentityId: string;
};

export function normalizeLifecycleBindingScope(
  value: SymphonyLifecycleBindingScope | null | undefined
): SymphonyLifecycleBindingScope | null {
  if (value === null || value === undefined) {
    return null;
  }

  return {
    organizationId: normalizeRequiredText(
      value.organizationId,
      "bindingScope.organizationId"
    ),
    linearWorkspaceIdentityId: normalizeRequiredText(
      value.linearWorkspaceIdentityId,
      "bindingScope.linearWorkspaceIdentityId"
    )
  };
}

export function assertMatchingLifecycleBindingScope(input: {
  owner: string;
  actual: SymphonyLifecycleBindingScope | null;
  expected: SymphonyLifecycleBindingScope | null;
}): void {
  if (input.expected === null) {
    if (input.actual !== null) {
      throw new TypeError(
        `${input.owner} is scoped to hosted workspace ${input.actual.organizationId}/${input.actual.linearWorkspaceIdentityId}, not the unscoped lifecycle path.`
      );
    }
    return;
  }

  if (input.actual === null) {
    throw new TypeError(
      `${input.owner} is unscoped and cannot satisfy hosted workspace ${input.expected.organizationId}/${input.expected.linearWorkspaceIdentityId}.`
    );
  }

  if (
    input.actual.organizationId !== input.expected.organizationId ||
    input.actual.linearWorkspaceIdentityId !==
      input.expected.linearWorkspaceIdentityId
  ) {
    throw new TypeError(
      `${input.owner} is scoped to hosted workspace ${input.actual.organizationId}/${input.actual.linearWorkspaceIdentityId}, not ${input.expected.organizationId}/${input.expected.linearWorkspaceIdentityId}.`
    );
  }
}

export function mapLifecycleBindingScope(input: {
  organizationId: string | null | undefined;
  linearWorkspaceIdentityId: string | null | undefined;
  owner: string;
}): SymphonyLifecycleBindingScope | null {
  const organizationId = sanitizeText(input.organizationId);
  const linearWorkspaceIdentityId = sanitizeText(input.linearWorkspaceIdentityId);

  if (Boolean(organizationId) !== Boolean(linearWorkspaceIdentityId)) {
    throw new TypeError(`${input.owner} has an invalid persisted binding scope.`);
  }

  return organizationId && linearWorkspaceIdentityId
    ? {
        organizationId,
        linearWorkspaceIdentityId
      }
    : null;
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = sanitizeText(value);
  if (!normalized) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
