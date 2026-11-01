-- Fake test data only (made-up names and numbers). Owner password for tests: OwnerPass2026x.
select cbt_private.set_admin_password('OwnerPass2026x');
insert into cbt_private.series(id,title,is_free,active) values
  ('11111111-1111-1111-1111-111111111111','PAID Series',false,true),
  ('22222222-2222-2222-2222-222222222222','FREE Series',true,true);
insert into cbt_private.tests(id,series_id,title,duration,data,question_count,active,practice,result_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Paid Live',30,
   '[{"q":"Q1","options":["a","b","c","d"],"answer":2,"explanation":"E1"}]',1,true,false,(extract(epoch from now())*1000)::bigint+3600000),
  ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Free Live',30,
   '[{"q":"F1","options":["a","b","c","d"],"answer":1,"explanation":"FE1"}]',1,true,false,(extract(epoch from now())*1000)::bigint+3600000),
  ('aaaaaaaa-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','Open mock',30,
   '[{"q":"OQ","options":["a","b","c","d"],"answer":3}]',1,true,false,null);
insert into cbt_private.series_files(id,series_id,title,kind,file_name,mime,size,parts,ready) values
  ('ffffffff-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Paid Notes','notes','paid.pdf','application/pdf',10,1,true),
  ('ffffffff-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Fake','notes','x.html','text/html',10,1,true);
insert into cbt_private.file_parts(file_id,n,data) values
  ('ffffffff-0000-0000-0000-000000000001',0,'PAID-PDF-CONTENT'),
  ('ffffffff-0000-0000-0000-000000000002',0,encode(convert_to('<script>alert(1)</script>','UTF8'),'base64'));
insert into cbt_private.students(id,name,mobile,status,salt,code_hash) values
  ('bbbbbbbb-0000-0000-0000-00000000000a','Free Student','9000000001','approved','s1',cbt_private.hash_code('s1','AAAA1111')),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Paid Student','9000000002','approved','s2',cbt_private.hash_code('s2','BBBB2222'));
insert into cbt_private.series_access values ('bbbbbbbb-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111');
insert into public.cbt_store_items(id,title,price,active,buy_on,series_id) values
  ('cccccccc-0000-0000-0000-000000000001','NEET Series',499,true,true,'11111111-1111-1111-1111-111111111111');
insert into public.cbt_promo_links(code,active,commission) values ('attackerlink',true,50);
insert into public.cbt_banners(title, body, link, active) values ('Evil','x','javascript:alert(1)',true),('Good','y','https://example.com',true);
