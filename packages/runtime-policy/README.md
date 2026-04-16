# @symphony/runtime-policy

Runtime policy normalization for Symphony model selection and execution settings.

## Owns

- Runtime policy values and validation.
- Pi profile defaults and policy-derived execution settings.
- Errors raised when runtime policy configuration is invalid.

## Does not own

- Router module selection.
- Harness execution.
- Tracker lifecycle mapping.

## Current State

This package is the policy boundary between product intent and harness launch settings. It should
keep model/profile selection explicit and reject ambiguous configuration early.
