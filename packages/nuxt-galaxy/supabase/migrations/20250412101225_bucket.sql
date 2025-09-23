create schema if not exists private;

insert into storage.buckets (id, name)
values ('analysis_files', 'analysis_files')
on conflict do nothing;

create or replace function private.uuid_or_null(str text)
returns uuid
language plpgsql
as $$
begin
  return str::uuid;
  exception when invalid_text_representation then
    return null;
  end;
$$;

