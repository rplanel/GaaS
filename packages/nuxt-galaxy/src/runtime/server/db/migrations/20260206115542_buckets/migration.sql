-- Custom SQL migration file, put your code below! --

insert into storage.buckets (id, name)
values ('analysis_files', 'analysis_files')
on conflict do nothing;


insert into storage.buckets (id, name, public)
values ('public_data', 'public_data', true)
on conflict do nothing;