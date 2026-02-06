-- Custom SQL migration file, put your code below! --

insert into storage.buckets (id, name)
values ('analysis_files', 'Analysis Files')
on conflict do nothing;


insert into storage.buckets (id, name, public)
values ('public_data', 'Public Data', true)
on conflict do nothing;