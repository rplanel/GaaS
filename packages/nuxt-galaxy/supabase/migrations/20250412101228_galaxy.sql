GRANT USAGE ON SCHEMA galaxy TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA galaxy TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA galaxy TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA galaxy TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA galaxy GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA galaxy GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA galaxy GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
