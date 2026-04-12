import {
  and,
  eq,
  inArray
} from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  symphonyGitHubRepositoryIdentitiesTable,
  symphonyLinearProjectIdentitiesTable,
  symphonyLinearTeamIdentitiesTable,
  symphonyRepositoryProjectBindingsTable,
  symphonyRepositoryTeamBindingsTable,
  symphonyRepositoryWorkspaceBindingsTable,
  type SymphonyRepositoryBindingSource
} from "./schema.js";

export type SymphonyRepositoryProjectBindingRecord = {
  repositoryProjectBindingId: string;
  linearProjectIdentityId: string;
  linearProjectId: string;
  source: SymphonyRepositoryBindingSource;
};

export type SymphonyRepositoryTeamBindingRecord = {
  repositoryTeamBindingId: string;
  linearTeamIdentityId: string;
  linearTeamId: string;
  linearTeamKey: string;
  source: SymphonyRepositoryBindingSource;
};

export type SymphonyRepositoryWorkspaceBindingRecord = {
  repositoryWorkspaceBindingId: string;
  githubInstallationIdentityId: string;
  githubRepositoryIdentityId: string;
  repositoryKey: string;
  linearWorkspaceIdentityId: string;
  source: SymphonyRepositoryBindingSource;
  teamBindings: SymphonyRepositoryTeamBindingRecord[];
  projectBindings: SymphonyRepositoryProjectBindingRecord[];
};

export type SymphonyWorkspaceBindingCatalog = {
  organizationId: string;
  linearWorkspaceIdentityId: string;
  repositories: SymphonyRepositoryWorkspaceBindingRecord[];
};

export interface SymphonyRepositoryBindingStore {
  loadActiveWorkspaceBindingCatalog(input: {
    organizationId: string;
    linearWorkspaceIdentityId: string;
  }): Promise<SymphonyWorkspaceBindingCatalog>;
}

export function createSymphonyRepositoryBindingStore(
  db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
): SymphonyRepositoryBindingStore {
  return new SqliteSymphonyRepositoryBindingStore(db);
}

class SqliteSymphonyRepositoryBindingStore
  implements SymphonyRepositoryBindingStore
{
  readonly #db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>;

  constructor(
    db: BetterSQLite3Database<typeof import("./schema.js").symphonySchema>
  ) {
    this.#db = db;
  }

  async loadActiveWorkspaceBindingCatalog(input: {
    organizationId: string;
    linearWorkspaceIdentityId: string;
  }): Promise<SymphonyWorkspaceBindingCatalog> {
    const organizationId = sanitizeRequiredText(
      input.organizationId,
      "organizationId"
    );
    const linearWorkspaceIdentityId = sanitizeRequiredText(
      input.linearWorkspaceIdentityId,
      "linearWorkspaceIdentityId"
    );

    const workspaceBindings = this.#db
      .select({
        repositoryWorkspaceBindingId:
          symphonyRepositoryWorkspaceBindingsTable.repositoryWorkspaceBindingId,
        githubInstallationIdentityId:
          symphonyRepositoryWorkspaceBindingsTable.githubInstallationIdentityId,
        githubRepositoryIdentityId:
          symphonyRepositoryWorkspaceBindingsTable.githubRepositoryIdentityId,
        repositoryKey: symphonyGitHubRepositoryIdentitiesTable.repositoryKey,
        linearWorkspaceIdentityId:
          symphonyRepositoryWorkspaceBindingsTable.linearWorkspaceIdentityId,
        source: symphonyRepositoryWorkspaceBindingsTable.source
      })
      .from(symphonyRepositoryWorkspaceBindingsTable)
      .innerJoin(
        symphonyGitHubRepositoryIdentitiesTable,
        and(
          eq(
            symphonyGitHubRepositoryIdentitiesTable.organizationId,
            symphonyRepositoryWorkspaceBindingsTable.organizationId
          ),
          eq(
            symphonyGitHubRepositoryIdentitiesTable.githubRepositoryIdentityId,
            symphonyRepositoryWorkspaceBindingsTable.githubRepositoryIdentityId
          )
        )
      )
      .where(
        and(
          eq(
            symphonyRepositoryWorkspaceBindingsTable.organizationId,
            organizationId
          ),
          eq(
            symphonyRepositoryWorkspaceBindingsTable.linearWorkspaceIdentityId,
            linearWorkspaceIdentityId
          ),
          eq(symphonyRepositoryWorkspaceBindingsTable.status, "active")
        )
      )
      .all();

    const workspaceBindingIds = workspaceBindings.map(
      (binding) => binding.repositoryWorkspaceBindingId
    );
    const teamBindingsByWorkspaceBindingId = new Map<
      string,
      SymphonyRepositoryTeamBindingRecord[]
    >();
    const projectBindingsByWorkspaceBindingId = new Map<
      string,
      SymphonyRepositoryProjectBindingRecord[]
    >();

    if (workspaceBindingIds.length > 0) {
      const teamBindings = this.#db
        .select({
          repositoryWorkspaceBindingId:
            symphonyRepositoryTeamBindingsTable.repositoryWorkspaceBindingId,
          repositoryTeamBindingId:
            symphonyRepositoryTeamBindingsTable.repositoryTeamBindingId,
          linearTeamIdentityId:
            symphonyRepositoryTeamBindingsTable.linearTeamIdentityId,
          linearTeamId: symphonyLinearTeamIdentitiesTable.linearTeamId,
          linearTeamKey: symphonyLinearTeamIdentitiesTable.linearTeamKey,
          source: symphonyRepositoryTeamBindingsTable.source
        })
        .from(symphonyRepositoryTeamBindingsTable)
        .innerJoin(
          symphonyLinearTeamIdentitiesTable,
          and(
            eq(
              symphonyLinearTeamIdentitiesTable.organizationId,
              symphonyRepositoryTeamBindingsTable.organizationId
            ),
            eq(
              symphonyLinearTeamIdentitiesTable.linearWorkspaceIdentityId,
              symphonyRepositoryTeamBindingsTable.linearWorkspaceIdentityId
            ),
            eq(
              symphonyLinearTeamIdentitiesTable.linearTeamIdentityId,
              symphonyRepositoryTeamBindingsTable.linearTeamIdentityId
            )
          )
        )
        .where(
          and(
            eq(symphonyRepositoryTeamBindingsTable.organizationId, organizationId),
            eq(
              symphonyRepositoryTeamBindingsTable.linearWorkspaceIdentityId,
              linearWorkspaceIdentityId
            ),
            eq(symphonyRepositoryTeamBindingsTable.status, "active"),
            inArray(
              symphonyRepositoryTeamBindingsTable.repositoryWorkspaceBindingId,
              workspaceBindingIds
            )
          )
        )
        .all();

      for (const binding of teamBindings) {
        const existing =
          teamBindingsByWorkspaceBindingId.get(
            binding.repositoryWorkspaceBindingId
          ) ?? [];
        existing.push({
          repositoryTeamBindingId: binding.repositoryTeamBindingId,
          linearTeamIdentityId: binding.linearTeamIdentityId,
          linearTeamId: binding.linearTeamId,
          linearTeamKey: binding.linearTeamKey,
          source: binding.source
        });
        teamBindingsByWorkspaceBindingId.set(
          binding.repositoryWorkspaceBindingId,
          existing
        );
      }

      const projectBindings = this.#db
        .select({
          repositoryWorkspaceBindingId:
            symphonyRepositoryProjectBindingsTable.repositoryWorkspaceBindingId,
          repositoryProjectBindingId:
            symphonyRepositoryProjectBindingsTable.repositoryProjectBindingId,
          linearProjectIdentityId:
            symphonyRepositoryProjectBindingsTable.linearProjectIdentityId,
          linearProjectId: symphonyLinearProjectIdentitiesTable.linearProjectId,
          source: symphonyRepositoryProjectBindingsTable.source
        })
        .from(symphonyRepositoryProjectBindingsTable)
        .innerJoin(
          symphonyLinearProjectIdentitiesTable,
          and(
            eq(
              symphonyLinearProjectIdentitiesTable.organizationId,
              symphonyRepositoryProjectBindingsTable.organizationId
            ),
            eq(
              symphonyLinearProjectIdentitiesTable.linearWorkspaceIdentityId,
              symphonyRepositoryProjectBindingsTable.linearWorkspaceIdentityId
            ),
            eq(
              symphonyLinearProjectIdentitiesTable.linearProjectIdentityId,
              symphonyRepositoryProjectBindingsTable.linearProjectIdentityId
            )
          )
        )
        .where(
          and(
            eq(
              symphonyRepositoryProjectBindingsTable.organizationId,
              organizationId
            ),
            eq(
              symphonyRepositoryProjectBindingsTable.linearWorkspaceIdentityId,
              linearWorkspaceIdentityId
            ),
            eq(symphonyRepositoryProjectBindingsTable.status, "active"),
            inArray(
              symphonyRepositoryProjectBindingsTable.repositoryWorkspaceBindingId,
              workspaceBindingIds
            )
          )
        )
        .all();

      for (const binding of projectBindings) {
        const existing =
          projectBindingsByWorkspaceBindingId.get(
            binding.repositoryWorkspaceBindingId
          ) ?? [];
        existing.push({
          repositoryProjectBindingId: binding.repositoryProjectBindingId,
          linearProjectIdentityId: binding.linearProjectIdentityId,
          linearProjectId: binding.linearProjectId,
          source: binding.source
        });
        projectBindingsByWorkspaceBindingId.set(
          binding.repositoryWorkspaceBindingId,
          existing
        );
      }
    }

    return {
      organizationId,
      linearWorkspaceIdentityId,
      repositories: workspaceBindings.map((binding) => ({
        repositoryWorkspaceBindingId: binding.repositoryWorkspaceBindingId,
        githubInstallationIdentityId: binding.githubInstallationIdentityId,
        githubRepositoryIdentityId: binding.githubRepositoryIdentityId,
        repositoryKey: binding.repositoryKey,
        linearWorkspaceIdentityId: binding.linearWorkspaceIdentityId,
        source: binding.source,
        teamBindings:
          teamBindingsByWorkspaceBindingId.get(
            binding.repositoryWorkspaceBindingId
          ) ?? [],
        projectBindings:
          projectBindingsByWorkspaceBindingId.get(
            binding.repositoryWorkspaceBindingId
          ) ?? []
      }))
    };
  }
}

function sanitizeRequiredText(value: string | null | undefined, field: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new TypeError(`${field} is required.`);
  }

  return normalized;
}
