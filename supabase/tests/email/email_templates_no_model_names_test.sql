-- 00789 — User-facing template bodies avoid model-feature names.
BEGIN;
SELECT plan(8);

SELECT ok((SELECT html_content IS NOT NULL AND html_content <> '' FROM public.email_templates WHERE slug = 'welcome-verification'), 'welcome HTML body exists');
SELECT hasnt_substr(html_content, 'Designer-Taught Intelligence', 'welcome HTML avoids Designer-Taught Intelligence') FROM public.email_templates WHERE slug = 'welcome-verification';
SELECT hasnt_substr(html_content, 'Aesthete', 'welcome HTML avoids Aesthete') FROM public.email_templates WHERE slug = 'welcome-verification';
SELECT hasnt_substr(html_content, ' AI ', 'welcome HTML avoids AI') FROM public.email_templates WHERE slug = 'welcome-verification';

SELECT ok((SELECT html_content IS NOT NULL AND html_content <> '' FROM public.email_templates WHERE slug = 'onboarding-aesthete'), 'onboarding HTML body exists');
SELECT hasnt_substr(html_content, 'Designer-Taught Intelligence', 'onboarding HTML avoids Designer-Taught Intelligence') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT hasnt_substr(html_content, 'Aesthete', 'onboarding HTML avoids Aesthete') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT hasnt_substr(html_content, ' AI ', 'onboarding HTML avoids AI') FROM public.email_templates WHERE slug = 'onboarding-aesthete';
SELECT * FROM finish();
ROLLBACK;
