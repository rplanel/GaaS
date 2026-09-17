CREATE OR REPLACE FUNCTION galaxy_rbac.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
declare
  is_admin boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  select exists (
    select 1
    from galaxy_rbac.user_roles ur
    inner join galaxy_rbac.roles r on ur.role_id = r.id
    where ur.user_id = auth.uid()
      and r.name = 'admin'
  ) into is_admin;

  return is_admin;
end;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION galaxy_rbac.is_admin() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION galaxy_rbac.is_admin() TO authenticated;
