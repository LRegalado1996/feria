-- FER-010: the public search compares text without accents, so a shopper
-- typing "nandu" on a phone finds "Ñandú". Idempotent: a database that has
-- the extension already keeps it.
CREATE EXTENSION IF NOT EXISTS unaccent;
