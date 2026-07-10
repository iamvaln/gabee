-- One-off backfill (2026-07-10): set gender on pre-existing profiles, guessed
-- from first names and validated by Valentine (spec: 2026-07-10-avatar-gender-design.md).
-- Only touches rows still NULL, matches names exactly; 'kahi' (undetermined)
-- and 'Test' (throwaway) are deliberately left unset.
--
-- Run AFTER the child_gender migration is deployed:
--   local : psql -d gabee -f packages/db/prisma/backfill-gender.sql
--   prod  : ssh deploy-vps 'docker exec -i gabee-db-1 psql -U gabee -d gabee' \
--             < packages/db/prisma/backfill-gender.sql

-- The accented name ('Léna') must survive the ssh/docker pipe byte-exact.
SET client_encoding = 'UTF8';

UPDATE child_profiles SET gender = 'girl'
WHERE gender IS NULL
  AND name IN ('Léna', 'Ana', 'Eunice', 'Ana Gabrielle', 'Mya', 'Manoela');

UPDATE child_profiles SET gender = 'boy'
WHERE gender IS NULL
  AND name IN ('Gilles Perry', 'Ezekiel', 'Michel', 'Ibrahim', 'Thibaut',
               'Israel', 'Aaron', 'Ralf Matthis', 'Ily Mael');

-- Report what the table looks like afterwards.
SELECT name, gender FROM child_profiles ORDER BY created_at;
