-- SQ-1110 walk B Item 1 (client half): simulate a pre-00807 item on a client-visible line.
-- Give the Aspen walnut dining table's library piece three served pictures, strip the
-- item's snapshot rows, then run the 00807 backfill. Local only.
update products set images = array[
  'http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-1.png','http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-2.png','http://127.0.0.1:54321/storage/v1/object/public/product-images/walk-b/lib-3.png']
where id = (select product_id from project_ffe_items where id = 'b0000000-0000-0000-0000-0000000cd042');
delete from project_ffe_item_images where item_id = 'b0000000-0000-0000-0000-0000000cd042';
select public._backfill_ffe_item_library_images();
select position, is_primary, source, right(url, 9) from project_ffe_item_images
where item_id = 'b0000000-0000-0000-0000-0000000cd042' order by position;
