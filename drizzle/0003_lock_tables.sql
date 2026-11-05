-- Supabase espone le tabelle di "public" con la sua API REST, raggiungibile con la chiave pubblica.
-- Qui le chiudiamo tutte: RLS attivo senza regole, e nessun permesso ai ruoli dell'API.
-- L'app legge e scrive dal server con il ruolo proprietario delle tabelle, che non è toccato.
-- Ogni tabella nuova va chiusa allo stesso modo nella sua migrazione.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
