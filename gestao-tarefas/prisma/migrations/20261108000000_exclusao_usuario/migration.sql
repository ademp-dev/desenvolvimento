-- Usuário excluído pelo administrador (quem tem histórico fica guardado, fora das telas)
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);
