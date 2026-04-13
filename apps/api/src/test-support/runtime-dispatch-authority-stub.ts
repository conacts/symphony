import type {
  SymphonyCapabilityDispatchAuthorityService
} from "../core/symphony-capability-dispatch-authority.js";

export function createExternalRunDispatchAuthority(): SymphonyCapabilityDispatchAuthorityService {
  return {
    async handleDispatchRequest() {
      return "external_run";
    }
  };
}
