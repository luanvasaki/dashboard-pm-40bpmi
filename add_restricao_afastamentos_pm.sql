-- Marca linhas de afastamentos_pm que na verdade são restrição (ex: Agregação/
-- "Apto com Restrição" vindas do WSSCPM), não afastamento de verdade.
-- Ficam visíveis no assentamento (extrato individual), mas não contam como
-- "afastado" em nenhum KPI — quem controla isso é o KPI de Restrições
-- (efetivo_pm.possui_restricao, alimentado só pelo SGP).
--
-- Rodar uma vez no SQL Editor do Supabase.

ALTER TABLE afastamentos_pm
  ADD COLUMN IF NOT EXISTS restricao boolean NOT NULL DEFAULT false;
