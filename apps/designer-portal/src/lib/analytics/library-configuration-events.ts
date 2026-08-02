import posthog from "posthog-js";
import { isAnalyticsEnabled } from "./posthog";

function capture(event: string, properties: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const libraryConfigurationEvents = {
  started: (productId: string, mode: string) =>
    capture("library_configuration_started", {
      product_id: productId,
      configuration_mode: mode,
    }),
  optionSelected: (productId: string, optionGroupId: string) =>
    capture("library_configuration_option_selected", {
      product_id: productId,
      option_group_id: optionGroupId,
    }),
  componentChanged: (productId: string, componentId: string) =>
    capture("library_configuration_component_changed", {
      product_id: productId,
      component_id: componentId,
    }),
  definitionSaved: (productId: string, mode: string) =>
    capture("library_configuration_definition_saved", {
      product_id: productId,
      configuration_mode: mode,
    }),
  saved: (productId: string, mode: string) =>
    capture("library_configuration_saved", {
      product_id: productId,
      configuration_mode: mode,
    }),
  placementOpened: (productId: string, mode: string) =>
    capture("library_configuration_placement_opened", {
      product_id: productId,
      configuration_mode: mode,
    }),
};
