-- SQ-1110 walk B Item 6: fill the firm and lead fields (state A), local only.
update organizations set
  logo_url = 'http://127.0.0.1:54321/storage/v1/object/public/studio-logos/walk-b/logo.png',
  website = 'https://www.localdevstudio.example',
  email = 'studio@localdevstudio.example',
  phone = '(612) 555-0100'
where id = 'b0000000-0000-0000-0000-000000000001';
update profiles set phone = '(612) 555-0144' where id = 'a0000000-0000-0000-0000-000000000004';
select name, logo_url is not null logo, website, email, phone from organizations where id = 'b0000000-0000-0000-0000-000000000001';
