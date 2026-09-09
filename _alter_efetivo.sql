ALTER TABLE `efetivo_pm`
  ADD COLUMN `cia`        VARCHAR(12) NULL AFTER `nome_guerra`,
  ADD COLUMN `municipio`  VARCHAR(80) NULL AFTER `cia`,
  ADD COLUMN `codigo_opm` VARCHAR(16) NULL AFTER `municipio`;
