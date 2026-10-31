-- ═══════════════════════════════════════════════════════════════════════════
-- 00905 — C2 launch service arrangement catalog (K10)
-- Held per K21 (Kody, 2026-10-30) out of the round-8 push; released at 00905
-- (the migration head was still 00904) after Kody approved all four
-- arrangements as is (K22, 2026-10-30): patina_six, design_only, whole_home,
-- fast_track. Phase content comes from the existing system phase templates.
-- Data only; no grants or capability activation.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.service_arrangements (arrangement_key, version, phase_template_slug, parts)
VALUES
  ('patina_six', 1, 'patina_six', jsonb_build_array(jsonb_build_object(
    'kind', 'scope_package', 'partKey', 'scope.patina-six', 'title', 'The Patina Six',
    'payload', jsonb_build_object(
      'packageKey', 'pkg.patina-six', 'label', 'Full-service design and furnishing',
      'inclusion', 'included',
      'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'studio',
        'payer', 'studio', 'fabrication_contract', 'studio', 'installation', 'studio'),
      'provenance', jsonb_build_object('arrangementKey', 'patina_six', 'arrangementVersion', 1)
    )
  ))),
  ('design_only', 1, 'design_only', jsonb_build_array(jsonb_build_object(
    'kind', 'scope_package', 'partKey', 'scope.design-only', 'title', 'Design-Only',
    'payload', jsonb_build_object(
      'packageKey', 'pkg.design-only', 'label', 'Design and documentation',
      'inclusion', 'included',
      'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'client',
        'payer', 'client', 'fabrication_contract', 'none', 'installation', 'client'),
      'provenance', jsonb_build_object('arrangementKey', 'design_only', 'arrangementVersion', 1)
    )
  ))),
  ('whole_home', 1, 'whole_home', jsonb_build_array(jsonb_build_object(
    'kind', 'scope_package', 'partKey', 'scope.whole-home', 'title', 'Whole Home Renovation',
    'payload', jsonb_build_object(
      'packageKey', 'pkg.whole-home', 'label', 'Whole-home design and procurement',
      'inclusion', 'included',
      'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'studio',
        'payer', 'studio', 'fabrication_contract', 'other', 'installation', 'gc'),
      'provenance', jsonb_build_object('arrangementKey', 'whole_home', 'arrangementVersion', 1)
    )
  ))),
  ('fast_track', 1, 'fast_track', jsonb_build_array(jsonb_build_object(
    'kind', 'scope_package', 'partKey', 'scope.fast-track', 'title', 'Fast Track Refresh',
    'payload', jsonb_build_object(
      'packageKey', 'pkg.fast-track', 'label', 'Furnishing and styling refresh',
      'inclusion', 'included',
      'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'studio',
        'payer', 'studio', 'fabrication_contract', 'none', 'installation', 'studio'),
      'provenance', jsonb_build_object('arrangementKey', 'fast_track', 'arrangementVersion', 1)
    )
  )))
ON CONFLICT (arrangement_key, version) DO NOTHING;
