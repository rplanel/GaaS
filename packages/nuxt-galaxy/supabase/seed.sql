insert into galaxy.instances
  (url, name)
values
  ('https://galaxy.pasteur.fr', 'Galaxy@Pasteur');



insert into galaxy.user
  (email, instance_id)
values
  ('remi.planel@pasteur.fr', (select id from galaxy.instances where url = 'https://galaxy.pasteur.fr'));


-- insert roles
insert into galaxy.roles
  (name)
values
  ('admin'),
  ( 'user');



insert into galaxy.role_permissions 
  (permission, role_id)
values 
  ('workflows.insert', (select id from galaxy.roles where name = 'admin')),
  ('workflows.delete', (select id from galaxy.roles where name = 'admin')),
  ('instances.insert', (select id from galaxy.roles where name = 'admin')),
  ('instances.delete', (select id from galaxy.roles where name = 'admin'));
