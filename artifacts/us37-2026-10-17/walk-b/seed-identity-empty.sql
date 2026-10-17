-- SQ-1110 walk B Item 6b: empty the firm logo, phone and website and the lead's phone (state B), local only.
update organizations set logo_url = null, website = null, phone = null
where id = 'b0000000-0000-0000-0000-000000000001';
update profiles set phone = null where id = 'a0000000-0000-0000-0000-000000000004';
select name, logo_url, website, email, phone from organizations where id = 'b0000000-0000-0000-0000-000000000001';
