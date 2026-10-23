-- Novo status "Aberta" entre "Nova" (CRIADO) e "Em andamento"
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'ABERTA' AFTER 'CRIADO';

-- E-mail do solicitante
ALTER TABLE "Task" ADD COLUMN "requesterEmail" TEXT;
CREATE INDEX "Task_requesterEmail_idx" ON "Task"("requesterEmail");
