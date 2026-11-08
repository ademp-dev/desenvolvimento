-- Novo status "Pausada" entre "Em andamento" e "Concluída"
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'PAUSADA' AFTER 'EM_ANDAMENTO';

-- Períodos efetivamente trabalhados (do Play até Pause, Concluir, Cancelar ou Atribuir)
CREATE TABLE "TaskWorkSession" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TaskWorkSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskWorkSession_taskId_startedAt_idx" ON "TaskWorkSession"("taskId", "startedAt");
CREATE INDEX "TaskWorkSession_userId_idx" ON "TaskWorkSession"("userId");

ALTER TABLE "TaskWorkSession" ADD CONSTRAINT "TaskWorkSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskWorkSession" ADD CONSTRAINT "TaskWorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tarefas que já existiam: o período entre o início (Play) e o encerramento
-- vira um período trabalhado do responsável atual; as que estão em andamento
-- ficam com o período aberto.
INSERT INTO "TaskWorkSession" ("taskId", "userId", "startedAt", "endedAt")
SELECT "id", "responsibleId", "startedAt",
       CASE "status"
         WHEN 'CONCLUIDO' THEN "completedAt"
         WHEN 'CANCELADO' THEN "canceledAt"
         ELSE NULL
       END
FROM "Task"
WHERE "startedAt" IS NOT NULL
  AND (
    "status" = 'EM_ANDAMENTO'
    OR ("status" = 'CONCLUIDO' AND "completedAt" >= "startedAt")
    OR ("status" = 'CANCELADO' AND "canceledAt" >= "startedAt")
  );
