/**
 * Passive OTA on PRESET_UPDATE_CHANNEL is handled in page-host (notify vs reload).
 * Background no longer force-reloads all tabs on channel change.
 */
export function installPassiveOtaListener(): void {
  // Intentionally empty — page-world GM listener restored in page-host.ts
}
