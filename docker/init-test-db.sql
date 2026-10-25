-- Runs once when the Postgres container is first created.
-- Integration tests use their own database so they never touch your dev data.
CREATE DATABASE csms_test;
