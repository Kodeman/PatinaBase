-- 00789 — User-facing template bodies avoid model-feature names.
BEGIN;
SELECT plan(8);

SELECT ok((SELECT html_content IS NOT NULL AND html_content <> '' FROM public.email_templates WHERE slug = 'welcome-verification'), 'welcome HTML body exists');
SELECT ok(html_content NOT LIKE '%Designer-Taught Intelligence%', 'welcome HTML avoids Designer-Taught Intelligence') FROM public.email_templates WHERE slug = 'welcome-verification';
SELECT ok(html_content NOT LIKE '%Aesthete%', 'welcome HTML avoids Aesthete') FROM public.email_templates WHERE slug = 'welcome-verification';
SELECT ok(html_content NOT LIKE '% AI %', 'welcome HTML avoids AI') FROM public.email_templates WHERE slug = 'welcome-verification';

SELECT ok((SELECT html_content IS NOT NULL AND html_content <> '' FROM public.email_templates WHERE slug = 'onboarding-aesthete'), 'onboarding HTML body exists');
SELECT ok(html_content NOT LIKE '%Designer-Taught Intelligence%', 'onboarding HTML avoids Designer-Taught Intelligence') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT ok(html_content NOT LIKE '%Aesthete%', 'onboarding HTML avoids Aesthete') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT ok(html_content NOT LIKE '% AI %', 'onboarding HTML avoids AI') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT * FROM finish();
ROLLBACK;
