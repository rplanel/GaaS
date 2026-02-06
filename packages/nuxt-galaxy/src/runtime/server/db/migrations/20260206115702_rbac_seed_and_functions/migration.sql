-- Custom SQL migration file, put your code below! --


-- insert admin and user roles into the roles table
insert into galaxy_rbac.roles (name) values ('admin');
insert into galaxy_rbac.roles (name) values ('user');

-- Custom SQL migration file, put your code below! --

-- Create the auth hook function

create or replace function galaxy_rbac.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
security definer
stable
as $$
  declare
    claims jsonb;
    user_role galaxy_rbac.role_type;
    userid integer;
  begin
    -- Fetch the user role in the user_roles table

    select r.name into user_role 
    from galaxy_rbac.user_roles ur
    inner join galaxy_rbac.roles r 
    on ur.role_id = r.id
    where user_id = (event->>'user_id')::uuid;



    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;

grant usage on schema galaxy_rbac to supabase_auth_admin;

grant execute
  on function galaxy_rbac.custom_access_token_hook
  to supabase_auth_admin;

revoke execute
  on function galaxy_rbac.custom_access_token_hook
  from authenticated, anon, public;

grant all
  on table galaxy_rbac.user_roles
to supabase_auth_admin;

grant all
  on table galaxy_rbac.roles
to supabase_auth_admin;

revoke all
  on table galaxy_rbac.user_roles
  from authenticated, anon, public;

revoke all
  on table galaxy_rbac.roles
  from authenticated, anon, public;

-- Enable RLS on tables before creating policies
-- alter table galaxy_rbac.user_roles enable row level security;
-- alter table galaxy_rbac.roles enable row level security;

-- create policy "Allow auth admin to read user roles" ON galaxy_rbac.user_roles
-- as permissive for select
-- to supabase_auth_admin
-- using (true);

-- create policy "Allow auth admin to read roles" ON galaxy_rbac.roles
-- as permissive for select
-- to supabase_auth_admin
-- using (true);



create or replace function galaxy_rbac.authorize(
  requested_permission galaxy_rbac.role_permissions_type
)
returns boolean 
language plpgsql
set search_path = ''
security definer
stable
as $$
declare
  bind_permissions int;
  user_role galaxy_rbac.role_type;
begin
  -- Fetch user role once and store it to reduce number of calls
  select (auth.jwt() ->> 'user_role')::galaxy_rbac.role_type into user_role;

  select count(*)
  into bind_permissions
  from galaxy_rbac.role_permissions rp
  inner join galaxy_rbac.roles r
  on rp.role_id = r.id
  where rp.permission = requested_permission
    and r.name = user_role;


  return bind_permissions > 0;
end;
$$;
