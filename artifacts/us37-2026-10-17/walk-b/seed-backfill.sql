-- SQ-1110 walk B: simulate an item that existed BEFORE 00807.
-- Give the Glazed Stoneware Planter library piece three served pictures, strip the
-- snapshot rows from its existing Cedar Lane Study item, then run the 00807 backfill.
update products set images = array[
  'http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-1.png','http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-2.png','http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-3.png']
where id = '744a5f21-feb6-5f1b-a036-f1fba4f182d2';
delete from project_ffe_item_images where item_id = 'f1900000-0000-4000-8000-000000000036';
select count(*) as rows_before_backfill from project_ffe_item_images where item_id = 'f1900000-0000-4000-8000-000000000036';
select public._backfill_ffe_item_library_images();
select position, is_primary, source, url from project_ffe_item_images
where item_id = 'f1900000-0000-4000-8000-000000000036' order by position;
