import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";
import { Role, UserStatus } from "../generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  }),
});

async function upsertWork(name: string, slug: string, aliases: string[]) {
  return prisma.work.upsert({
    where: { slug },
    update: {
      name,
      costCenterAliases: JSON.stringify(aliases),
      active: true,
    },
    create: {
      name,
      slug,
      costCenterAliases: JSON.stringify(aliases),
    },
  });
}

async function upsertUser(input: {
  name: string;
  username: string;
  email: string;
  role: Role;
  status: UserStatus;
  password: string;
  phone?: string;
  workIds?: string[];
}) {
  const passwordHash = await hash(input.password, 12);
  const user = await prisma.user.upsert({
    where: { username: input.username },
    update: {
      name: input.name,
      email: input.email,
      role: input.role,
      status: input.status,
      passwordHash,
      phone: input.phone,
    },
    create: {
      name: input.name,
      username: input.username,
      email: input.email,
      role: input.role,
      status: input.status,
      passwordHash,
      phone: input.phone,
    },
  });

  if (input.workIds) {
    await prisma.userWork.deleteMany({ where: { userId: user.id } });
    await prisma.userWork.createMany({
      data: input.workIds.map((workId) => ({ userId: user.id, workId })),
    });
  }

  return user;
}

async function main() {
  // Contas/centros de custo iniciais. Os aliases cobrem como cada centro de
  // custo aparece escrito nas linhas de pagamento da planilha.
  const works = await Promise.all([
    upsertWork("EDISER", "ediser", ["EDISER"]),
    upsertWork("RECAP", "recap", ["RECAP"]),
    upsertWork("JERONIMO", "jeronimo", [
      "JERONIMO",
      "Despesa Pessoal Jeronimo",
      "Despesa Pessoal Jeronimo DJ",
      "Jeronimo DJ",
    ]),
  ]);

  const workIds = works.map((work) => work.id);

  // Login inicial pedido na especificacao: jfx / jfx. So o nome exibido e o
  // e-mail sao genericos; as credenciais seguem as combinadas.
  await upsertUser({
    name: "Administrador",
    username: "jfx",
    email: "admin@djfluxo.local",
    role: Role.COORDENADOR,
    status: UserStatus.ATIVO,
    password: "jfx",
    workIds,
  });

  console.log("Seed concluido.");
  console.log(`Obras/contas: ${works.map((work) => work.name).join(", ")}`);
  console.log("Acesso inicial: jfx / jfx (Coordenador)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
