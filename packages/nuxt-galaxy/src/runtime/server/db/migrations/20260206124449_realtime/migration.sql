-- Custom SQL migration file, put your code below! --
alter publication supabase_realtime add table galaxy.analyses;
alter publication supabase_realtime add table galaxy.histories;
alter publication supabase_realtime add table galaxy.jobs;
alter publication supabase_realtime add table galaxy.analysis_outputs;
