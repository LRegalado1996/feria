-- FER-012 takes the posts demo out of the code and out of the Drizzle schema,
-- but not out of the database: the build this deploy replaces still reads
-- "post" while the migration runs, and so do the tabs it left open
-- (docs/agents/database.md § Migrations: expand → stop reading → contract).
-- FER-041 drops the table once no deployed build reads it; until then this
-- note on the table is the only change.
COMMENT ON TABLE "post" IS 'Unused since FER-012; FER-041 drops it.';
