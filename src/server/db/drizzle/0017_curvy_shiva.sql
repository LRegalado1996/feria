-- FER-051: whether the store's header and phone menu list a group or a
-- category in no group ("Mostrar en el encabezado"). Expand only: the build
-- this deploy replaces never names the column, so its inserts take the
-- default, and a category keeps showing as it did. Guarded, so a database
-- that took this column from the branch's earlier migration (FER-051's
-- first 0016, before the migrations below it were renumbered) runs it too.
ALTER TABLE "category" ADD COLUMN IF NOT EXISTS "showInHeader" boolean DEFAULT true NOT NULL;
