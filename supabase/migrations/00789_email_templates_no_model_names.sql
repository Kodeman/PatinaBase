-- ═══════════════════════════════════════════════════════════════════════════
-- 00789 — Remove model-feature names from welcome and onboarding email bodies
-- Re-bakes the current 00405 welcome and 00404 onboarding-aesthete bodies with
-- only the user-facing copy changed. Safe to rerun.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.email_templates
SET html_content = replace(
      html_content,
      'Every piece you save and every maker you choose teaches Patina a little more about your eye. We call that <strong style="color:#1F1B16; font-weight:600;">Designer-Taught Intelligence</strong>, and it sharpens with every project.',
      'Every piece you save and every maker you choose teaches Patina a little more about your eye. Working designers teach Patina what to surface, and that understanding sharpens with every project.'
    ),
    updated_at = now()
WHERE slug = 'welcome-verification'
  AND html_content LIKE '%Designer-Taught Intelligence%';

UPDATE public.email_templates
SET html_content = replace(html_content, 'Aesthete', 'Patina'),
    updated_at = now()
WHERE slug = 'onboarding-aesthete'
  AND html_content LIKE '%Aesthete%';
