# Hosted Identity And Bindings Plan

## Purpose

This plan turns the DB and tracker research into a concrete implementation sequence for the hosted product.

The goal is to make identity, tenant scope, and workflow bindings explicit before we move the rest of the platform toward hosted execution and hosted UI. The result should be a control plane that can safely support:

- users and organizations
- GitHub installations and repositories
- Linear workspaces, teams, and projects
- repository/workspace bindings
- workflow and router configuration ownership
- re-keying of issues, workflows, and runs to tenant-scoped identity

The key principle is simple: if identity matters to routing, execution, or lifecycle authority, it must be persisted as canonical control-plane data instead of inferred from env order, repo slugs, or local runtime state.

## Design Rules

1. Required identity should be required in the database and type system.
2. Fallback identity is not allowed.
3. Raw vendor payloads belong in raw or audit storage, not in canonical control-plane tables.
4. Workflow history remains lifecycle authority.
5. Projections may summarize state, but they may not invent it.
6. Tenant scope must be explicit before any hosted workflow can be created, resumed, or observed.

## What This Plan Covers

This plan covers the hosted identity model and the binding model that sits underneath it:

- user and organization identity
- external integration identity
- tenant membership and workspace access
- repository and workspace bindings
- workflow/router configuration ownership
- re-keying existing issue, workflow, and run records to tenant-scoped identifiers

It does not cover UI implementation, cloud sandbox execution, or user-authored router extensibility beyond the identity records those features will consume.

## Slice Order

The slices below are ordered by dependency. Later slices assume the earlier ones are complete.

### Slice 1: Add Tenant Identity As First-Class Control-Plane Data

Goal: create the canonical ownership layer for hosted Symphony.

Scope:

- users
- organizations
- memberships
- org-scoped access roles
- external-auth bindings for user and org ownership

Concrete work:

- add canonical tables for `users`, `organizations`, and `memberships`
- require `user_id` and `organization_id` as foreign keys on membership and ownership tables
- represent membership role and status explicitly
- store external identity bindings for GitHub and Linear access separately from internal ownership
- make it impossible to create hosted resources without an owning organization

Exit criteria:

- every hosted workflow has an owning organization
- every hosted user can be mapped to organization membership explicitly
- no product path relies on a default or inferred tenant

Hard cuts:

- no zero-organization mode for hosted control-plane records
- no silent derivation of org identity from repo or Linear data
- no nullable ownership fields for newly created hosted rows

### Slice 2: Add External Integration Identity

Goal: represent GitHub and Linear as durable, tenant-scoped bindings instead of runtime assumptions.

Scope:

- GitHub installations
- GitHub repositories
- Linear workspaces
- Linear teams
- Linear projects

Concrete work:

- add tables for GitHub installation ownership and repository membership
- add tables for Linear workspace ownership and scoped team/project membership
- bind each installation/workspace to exactly one organization
- store canonical external ids, display names, and sync status explicitly
- distinguish remote identity from repo-key or team-key shortcuts

Exit criteria:

- a GitHub repository can be resolved through a persisted installation binding
- a Linear workspace/team/project can be resolved through a persisted tenant binding
- no consumer needs to infer external identity from local env or repo ordering

Hard cuts:

- no “first admitted repo” fallback
- no repository resolution from path segments
- no multi-tenant ambiguity in external identity lookup

### Slice 3: Add Repo And Workspace Binding Tables

Goal: make hosted routing and lifecycle lookup depend on persisted bindings rather than runtime inference.

Scope:

- repository/workspace bindings
- organization/repository relationships
- organization/Linear workspace relationships
- binding status and source of truth metadata

Concrete work:

- add a durable binding table that connects:
  - organization
  - GitHub installation
  - GitHub repository
  - Linear workspace
  - Linear team or project where relevant
- record the binding source, activation status, and created/updated timestamps
- make bindings queryable as the authoritative path for routed bootstrap and tracker ingress
- ensure the binding row is the first thing every hosted ingress path can ask for

Exit criteria:

- every hosted route can resolve its tenant binding before touching lifecycle state
- ingress paths no longer need to guess which repository or workspace they belong to
- binding lookup fails fast when the tenant scope is missing or invalid

Hard cuts:

- no implicit binding from environment variable order
- no binding reuse across organizations unless it is explicit and scoped
- no hidden repository admission logic outside the binding model

### Slice 4: Re-Key Issues, Workflows, And Runs To Tenant Scope

Goal: stop treating issue identifier, workflow identifier, and run identifier as globally meaningful without tenant scope.

Scope:

- issues
- workflows
- runs
- route history and snapshots that reference those entities

Concrete work:

- re-key issue storage so issue identity is scoped by tenant and external source
- re-key workflow records so they reference the tenant binding and repository binding explicitly
- re-key run records so they inherit the same tenant binding as their workflow
- update read paths so they resolve through canonical tenant-scoped identity
- keep history rows and snapshots attached to the scoped authority they were created under

Exit criteria:

- a workflow cannot be resumed without resolving the same tenant scope it was created under
- a run cannot appear valid without the organization and repository binding that owns it
- issue identity collisions across tenants are not possible in canonical storage

Hard cuts:

- no global issue identity assumption
- no workflow or run rows keyed only by repository slug
- no read-side repair that silently merges tenant scopes

### Slice 5: Move Workflow And Router Config Ownership Into Persisted Control-Plane Data

Goal: stop deriving runtime behavior from repo-local files alone once the hosted model is in place.

Scope:

- workflow router configuration
- preset selection
- repository-level workflow defaults
- org-level policy overrides

Concrete work:

- add persisted ownership for router preset selection
- store workflow/router config at the organization or repository binding layer
- allow repo-local defaults only as input into an explicit canonical record
- make hosted bootstrap read config from persisted ownership first, not from the filesystem first
- keep repo-local manifests as inputs, not as the owner of hosted truth

Exit criteria:

- hosted workflows can be recreated from persisted config without depending on a local checkout
- router preset choice is explicit and tenant-owned
- workflow config can be edited without rewriting the entire control plane

Hard cuts:

- no hidden fallback to `.symphony/runtime.ts` as the source of hosted truth
- no manifest-only ownership once hosted config exists
- no runtime policy derived from local filesystem order

### Slice 6: Remove Legacy Single-Tenant Assumptions

Goal: hard cut old assumptions after the new identity model is in place.

Scope:

- old repo-only assumptions
- old global issue identity assumptions
- old runtime bootstrap fallbacks
- old convenience reads that hide missing tenant scope

Concrete work:

- delete fallback logic that assumes one repository or one workspace
- replace convenience reads with explicit tenant-scoped lookups
- remove any ability to admit hosted state without tenant ownership
- delete direct paths that still treat local bootstrap as the product model

Exit criteria:

- hosted bootstrap is explicit and early-failing
- tenant scope is required at every authority boundary
- the old single-tenant model is not supported by new product paths

Hard cuts:

- no backward compatibility for old identity shortcuts
- no fallback repo admission
- no “default” organization, repository, or workspace

## Dependency Order

The dependency chain is intentionally strict:

1. tenant identity
2. external integration identity
3. repo and workspace bindings
4. issue/workflow/run re-keying
5. workflow/router config ownership
6. legacy assumption removal

This order matters because the binding model must exist before we can safely re-key lifecycle records, and the re-keyed lifecycle records must exist before we can delete the old single-tenant assumptions.

## What Must Be Preserved

The following should remain true throughout the migration:

- workflow history remains the lifecycle authority
- route snapshots remain projections, not truth sources
- raw vendor payloads remain raw where they are preserved
- operator-visible audit records remain readable even when canonical identity changes

## Non-Goals

This plan does not include:

- hosted UI implementation
- cloud sandbox wiring
- marketplace-style user-authored router modules
- broad package cleanup outside the identity and binding layers
- preserving old database compatibility once the new canonical model is in place
- expanding customization before the hosted core is stable

## Suggested Implementation Strategy

The safest way to execute this plan is to treat it as three parallel tracks after Slice 1 is in place:

1. DB track: define and migrate the hosted identity and binding schema.
2. API track: make bootstrap, ingress, and rehydration consume the new bindings.
3. Tracker track: tighten identity and normalization so tracker data cannot outrun the hosted model.

Those tracks should stay coordinated through the same contract decisions, but they should not wait on UI work or worker-execution refactors.

## Final Definition Of Done

This plan is complete when:

- hosted users and organizations are explicit and required
- GitHub and Linear identities are persisted as tenant-owned records
- repo and workspace bindings are durable and queryable
- issues, workflows, and runs are scoped by tenant identity
- workflow/router config is owned by persisted control-plane data
- old single-tenant assumptions are removed from the hosted path

