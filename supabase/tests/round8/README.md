Use `*_test.sql` on a reset database (CI); use `*_isolated.psql` via host psql on an un-reset shared database to apply the migration and run its assertions inside a rolled-back transaction.
