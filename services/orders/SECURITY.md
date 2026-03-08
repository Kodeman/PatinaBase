# Security Notes

## Order & Shipment Identifiers
- Checkout order numbers now append a cryptographically secure, uppercase alphanumeric suffix via the shared `@patina/utils` helpers.
- Fulfillment shipment numbers reuse the same secure generator, eliminating prior `Math.random` collisions.

### Operational Guidance
- Downstream ERPs, 3PL integrations, or analytics tooling that cached predictable suffixes should be refreshed; identifiers are no longer sequential beyond the timestamp component.
- If external partners validate identifier formats, confirm they allow uppercase `[0-9A-Z]{4}` order suffixes and `[0-9A-Z]{9}` shipment suffixes.
- No bulk rotation is required, but monitor ingestion jobs for assumptions about deterministic suffixes and update mappings accordingly.
