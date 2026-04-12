import type { SymphonyRuntimeConfigResult } from "@symphony/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { RuntimeSummaryConnectionState } from "@/features/overview/model/overview-view-model";

export function RuntimeConfigView(input: {
  connection: RuntimeSummaryConnectionState;
  error: string | null;
  loading: boolean;
  config: SymphonyRuntimeConfigResult | null;
}) {
  if (input.loading && input.config === null) {
    return (
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-48" />
            </CardContent>
          </Card>
        ))}
      </section>
    );
  }

  if (input.config === null) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        {input.error ? (
          <Alert variant="destructive">
            <AlertTitle>Runtime config unavailable</AlertTitle>
            <AlertDescription>{input.error}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Runtime config unavailable</CardTitle>
            <CardDescription>{input.connection.detail}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const config = input.config;
  const defaultRepository =
    config.admittedRepositories.find(
      (repository) => repository.repositoryKey === config.bootstrap.defaultRepositoryKey
    ) ?? null;
  const sourceRepos = config.bootstrap.repositorySource.sourceRepos;
  const summaryCards = [
    {
      label: "Repository source",
      value: formatRepositorySourceLabel(config.bootstrap.repositorySource.kind),
      detail: `${sourceRepos.length} source repo${sourceRepos.length === 1 ? "" : "s"}`
    },
    {
      label: "Default repository",
      value: config.bootstrap.defaultRepositoryKey,
      detail: `GitHub repo ${config.runtime.githubRepository}`
    },
    {
      label: "Active preset",
      value: config.bootstrap.presetSelection.presetId,
      detail: formatPresetSourceLabel(config.bootstrap.presetSelection.source)
    },
    {
      label: "Binding scope",
      value:
        config.bootstrap.bindingScope === null
          ? "Local only"
          : `${config.bootstrap.bindingScope.organizationId}/${config.bootstrap.bindingScope.linearWorkspaceIdentityId}`,
      detail:
        config.bindingCatalog === null
          ? "No persisted workspace binding catalog is active."
          : `${config.bindingCatalog.repositories.length} bound repos in the active catalog`
    },
    {
      label: "GitHub auth",
      value: formatGitHubAuthModeLabel(config.credentials.githubCliAuthMode),
      detail:
        config.credentials.githubCliAuthEnvKey ?? "No GitHub CLI env key detected."
    }
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {input.error ? (
        <Alert variant="destructive">
          <AlertTitle>Runtime config degraded</AlertTitle>
          <AlertDescription>{input.error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Local control plane
        </p>
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Runtime config</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Inspect the exact bootstrap inputs the local runtime accepted: admitted
            repositories, active preset, persisted binding scope, and credential mode.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="space-y-1 pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl">{card.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {card.detail}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bootstrap runtime</CardTitle>
            <CardDescription>
              The local runtime authority that booted this process.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <KeyValueRow label="Harness" value={config.runtime.agentHarness} />
            <KeyValueRow
              label="Tracker"
              value={
                config.runtime.trackerKind === "linear" &&
                config.runtime.trackerTeamKey !== null
                  ? `${config.runtime.trackerKind} (${config.runtime.trackerTeamKey})`
                  : config.runtime.trackerKind
              }
            />
            <KeyValueRow
              label="Workspace root"
              value={config.runtime.workspaceRoot}
              monospace
            />
            <KeyValueRow
              label="Manifest path"
              value={config.bootstrap.manifestPath ?? "Not recorded"}
              monospace
            />
            <KeyValueRow
              label="Prompt path"
              value={defaultRepository?.promptPath ?? "Not recorded"}
              monospace
            />
            <CodeList label="Source repositories" values={sourceRepos} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Credential sources</CardTitle>
            <CardDescription>
              Current local runtime auth modes. This page does not require hosted
              OAuth or provider installs.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <KeyValueRow
              label="Linear API key"
              value={config.credentials.linearApiKeyConfigured ? "Configured" : "Missing"}
            />
            <KeyValueRow
              label="GitHub CLI auth"
              value={formatGitHubAuthModeLabel(config.credentials.githubCliAuthMode)}
            />
            <KeyValueRow
              label="GitHub env key"
              value={config.credentials.githubCliAuthEnvKey ?? "Not using env auth"}
              monospace={config.credentials.githubCliAuthEnvKey !== null}
            />
            <KeyValueRow
              label="Pi auth"
              value={formatPiAuthModeLabel(config.credentials.piAuthMode)}
            />
            <KeyValueRow
              label="Pi provider env key"
              value={config.credentials.piProviderEnvKey ?? "Not using provider env auth"}
              monospace={config.credentials.piProviderEnvKey !== null}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Admitted repositories</CardTitle>
          <CardDescription>
            Repositories the runtime may route and execute against on this machine.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repository</TableHead>
                <TableHead>Linear team</TableHead>
                <TableHead>Repo root</TableHead>
                <TableHead>Manifest</TableHead>
                <TableHead>Prompt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {config.admittedRepositories.map((repository) => (
                <TableRow key={repository.repositoryKey}>
                  <TableCell className="font-medium">{repository.repositoryKey}</TableCell>
                  <TableCell>{repository.linearTeamKey}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {repository.repoRoot}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {repository.manifestPath}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {repository.promptPath}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Persisted workspace bindings</CardTitle>
          <CardDescription>
            When present, this catalog constrains repository selection and ties the
            runtime to an explicit organization and Linear workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {config.bindingCatalog === null ? (
            <p className="text-sm text-muted-foreground">
              No persisted workspace binding catalog is active. The runtime is currently
              booted from local admitted repositories only.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{config.bindingCatalog.organizationId}</Badge>
                <Badge variant="outline">
                  {config.bindingCatalog.linearWorkspaceIdentityId}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead>Binding</TableHead>
                    <TableHead>GitHub repo identity</TableHead>
                    <TableHead>Teams</TableHead>
                    <TableHead>Projects</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {config.bindingCatalog.repositories.map((repository) => (
                    <TableRow key={repository.repositoryWorkspaceBindingId}>
                      <TableCell className="font-medium">
                        {repository.repositoryKey}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {repository.repositoryWorkspaceBindingId}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {repository.githubRepositoryIdentityId}
                      </TableCell>
                      <TableCell className="text-xs">
                        {repository.teamBindings.length === 0
                          ? "None"
                          : repository.teamBindings
                              .map((binding) => binding.linearTeamKey)
                              .join(", ")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {repository.projectBindings.length === 0
                          ? "None"
                          : repository.projectBindings
                              .map((binding) => binding.linearProjectId)
                              .join(", ")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{repository.source}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KeyValueRow(input: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="grid gap-1 md:grid-cols-[160px_minmax(0,1fr)] md:items-start">
      <p className="font-medium text-foreground">{input.label}</p>
      <p
        className={
          input.monospace
            ? "break-all font-mono text-xs text-muted-foreground"
            : "text-muted-foreground"
        }
      >
        {input.value}
      </p>
    </div>
  );
}

function CodeList(input: {
  label: string;
  values: string[];
}) {
  return (
    <div className="grid gap-1 md:grid-cols-[160px_minmax(0,1fr)] md:items-start">
      <p className="font-medium text-foreground">{input.label}</p>
      <div className="flex min-w-0 flex-col gap-1">
        {input.values.map((value) => (
          <code
            key={value}
            className="break-all rounded border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
          >
            {value}
          </code>
        ))}
      </div>
    </div>
  );
}

function formatRepositorySourceLabel(kind: string): string {
  switch (kind) {
    case "admitted_source_repositories":
      return "Admitted repos";
    case "persisted_workspace_bindings":
      return "Persisted bindings";
    default:
      return kind;
  }
}

function formatPresetSourceLabel(source: string): string {
  switch (source) {
    case "registry_default":
      return "Registry default";
    case "runtime_manifest":
      return "Runtime manifest";
    case "bootstrap_override":
      return "Bootstrap override";
    default:
      return source;
  }
}

function formatGitHubAuthModeLabel(mode: string): string {
  switch (mode) {
    case "env":
      return "Env";
    case "mount":
      return "Mounted config";
    case "none":
      return "Unavailable";
    default:
      return mode;
  }
}

function formatPiAuthModeLabel(mode: string): string {
  switch (mode) {
    case "provider_env":
      return "Provider env";
    case "auth_json":
      return "Mounted auth.json";
    case "none":
      return "Unavailable";
    default:
      return mode;
  }
}
