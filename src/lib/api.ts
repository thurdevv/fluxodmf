import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Falha de validacao e erro do cliente: devolve a primeira mensagem do schema
  // em vez de um 500 generico, que esconderia o campo errado.
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      { error: first?.message ?? "Dados inválidos.", field },
      { status: 400 },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "Nao foi possivel concluir a operacao." },
    { status: 500 },
  );
}
