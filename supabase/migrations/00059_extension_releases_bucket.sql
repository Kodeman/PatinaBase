-- Storage bucket for self-hosted beta extension releases
INSERT INTO storage.buckets (id, name, public)
VALUES ('extension-releases', 'extension-releases', true)
ON CONFLICT (id) DO NOTHING;
