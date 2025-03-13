
-- HISTORY
create policy "Authenticated users can create their own history"
on galaxy.histories for insert to authenticated with check (
    owner_id = auth.uid()
);

create policy "Users can view their own history"
on galaxy.histories for select to authenticated using (
    owner_id = auth.uid()
);

create policy "Users can update their own history"
on galaxy.histories for update to authenticated 
using (
    owner_id = auth.uid()
)
with check (
    owner_id = auth.uid()
);

create policy "Users can delete their own history"
on galaxy.histories for delete to authenticated using (
    owner_id = auth.uid()
);

alter table galaxy.histories enable row level security;



-- ANALYSES

create policy "Authenticated users can create their own analysis"
on galaxy.analyses for insert to authenticated with check (
    owner_id = auth.uid()
);

create policy "Users can view their own analysis"
on galaxy.analyses for select to authenticated using (
    owner_id = auth.uid()
);

create policy "Users can update their own analysis"
on galaxy.analyses for update to authenticated 
using (
    owner_id = auth.uid()
)
with check (
    owner_id = auth.uid()
);

create policy "Users can delete their own analysis"
on galaxy.analyses for delete to authenticated using (
    owner_id = auth.uid()
);

alter table galaxy.analyses enable row level security;


-- DATASETS

alter table galaxy.datasets enable row level security;

create policy "Users can insert documents"
on galaxy.datasets for insert to authenticated with check (
  auth.uid() = owner_id
);

create policy "Users can query their own documents"
on galaxy.datasets for select to authenticated using (
  auth.uid() = owner_id
);

alter table galaxy.datasets enable row level security;


-- WORKFLOWS

alter table galaxy.workflows enable row level security;


create policy "Users can query workflows"
on galaxy.workflows for select to authenticated using (
  true
);

create policy "Admin can insert workflows"
on galaxy.workflows for insert to authenticated with check (
  (SELECT galaxy.authorize('workflows.insert')) = TRUE
);



-- UPLOAD datasets


alter table galaxy.uploaded_datasets enable row level security;

create policy "Users can insert datasets"
on galaxy.uploaded_datasets for insert to authenticated with check (
  auth.uid() = owner_id
);

create policy "Users can query their own uploaded datasets"
on galaxy.uploaded_datasets for select to authenticated using (
  auth.uid() = owner_id
);

alter table galaxy.uploaded_datasets enable row level security;


-- Jobs

create policy "Authenticated users can create their own jobs"
on galaxy.jobs for insert to authenticated with check (
    owner_id = auth.uid()
);

create policy "Users can view their own jobs"
on galaxy.jobs for select to authenticated using (
    owner_id = auth.uid()
);

create policy "Users can update their own jobs"
on galaxy.jobs for update to authenticated 
using (
    owner_id = auth.uid()
)
with check (
    owner_id = auth.uid()
);

create policy "Users can delete their own jobs"
on galaxy.jobs for delete to authenticated using (
    owner_id = auth.uid()
);

alter table galaxy.jobs enable row level security;


-- Galaxy instances

alter table galaxy.instances enable row level security;


create policy "Users can query instances"
on galaxy.instances for select to authenticated using (
  true
);

create policy "Admin can insert instances"
on galaxy.instances for insert to authenticated with check (
  (SELECT galaxy.authorize('instances.insert')) = TRUE
);



-- Galaxy roles

alter table "galaxy"."roles" enable row level security;

alter table "galaxy"."user_roles" enable row level security;


-- STORAGE

create policy "Authenticated users can upload files"
on storage.objects for insert to authenticated with check (
  bucket_id = 'analysis_files' and
    owner = auth.uid() and
    private.uuid_or_null(path_tokens[1]) is not null
);

create policy "Users can view their own files"
on storage.objects for select to authenticated using (
  bucket_id = 'analysis_files' and owner = auth.uid()
);

create policy "Users can update their own files"
on storage.objects for update to authenticated with check (
  bucket_id = 'analysis_files' and owner = auth.uid()
);

create policy "Users can delete their own files"
on storage.objects for delete to authenticated using (
  bucket_id = 'analysis_files' and owner = auth.uid()
);
