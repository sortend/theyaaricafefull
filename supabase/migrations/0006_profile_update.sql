-- Customers may edit their own row; column grants (full_name, phone only) still block role/active changes.
create policy profiles_update_self on profiles for update using (id = auth.uid()) with check (id = auth.uid());
