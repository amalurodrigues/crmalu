import "dotenv/config";
import { db, users, hashPassword, pool } from "@tego/db";
import { eq } from "drizzle-orm";

/**
 * Cria ou atualiza a senha de um usuário do painel.
 *
 * A senha é lida do teclado com eco desligado, não de argumento nem de variável
 * de ambiente: argumento aparece na lista de processos da máquina e no
 * histórico do shell, e variável de ambiente vaza em log de erro e em dump de
 * processo. Digitada e descartada é o único caminho que não deixa rastro.
 *
 * Uso:
 *   npx tsx scripts/set-password.ts operador@exemplo.com
 */

/**
 * Digitação visível, para terminais sem modo raw.
 *
 * Terminal integrado de editor costuma não expor TTY, e a primeira versão deste
 * script simplesmente RECUSAVA rodar nesse caso — o que trancou a operadora
 * para fora do próprio painel. Recusar não protegia ninguém: a senha continuava
 * tendo que ser definida de algum jeito, e o jeito que sobrava era pior.
 *
 * Aqui a senha aparece na tela enquanto é digitada. É menos discreto do que o
 * modo raw, mas continua fora do histórico de shell e da lista de processos,
 * que são as duas superfícies que realmente vazam.
 */
let rlCompartilhada: import("node:readline/promises").Interface | null = null;

async function perguntaVisivel(rotulo: string): Promise<string> {
  // UMA interface para todas as perguntas: fechar uma interface de readline
  // fecha o stdin junto, e a pergunta seguinte receberia string vazia sem
  // nunca esperar o usuário digitar.
  if (!rlCompartilhada) {
    const { createInterface } = await import("node:readline/promises");
    rlCompartilhada = createInterface({ input: process.stdin, output: process.stdout });
  }
  return rlCompartilhada.question(rotulo);
}

function fecharPrompt() {
  rlCompartilhada?.close();
  rlCompartilhada = null;
}

function perguntaSenha(rotulo: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    if (!rlCompartilhada) {
      console.warn("  (terminal sem modo oculto — a senha aparece enquanto você digita)");
    }
    return perguntaVisivel(rotulo);
  }

  return new Promise((resolve) => {
    process.stdout.write(rotulo);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let senha = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        switch (c) {
          case "\n":
          case "\r":
          case "": // Ctrl-D
            stdin.setRawMode(false);
            stdin.pause();
            stdin.removeListener("data", onData);
            process.stdout.write("\n");
            resolve(senha);
            return;
          case "": // Ctrl-C
            stdin.setRawMode(false);
            stdin.pause();
            process.stdout.write("\n");
            process.exit(130);
            return;
          case "": // backspace
          case "\b":
            senha = senha.slice(0, -1);
            break;
          default:
            if (c >= " ") senha += c;
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Uso: npx tsx scripts/set-password.ts <email>");
    process.exit(1);
  }

  const senha = await perguntaSenha(`Senha para ${email}: `);
  const confirma = await perguntaSenha("Repita a senha: ");

  if (senha !== confirma) {
    console.error("\nAs senhas não conferem. Nada foi gravado.");
    process.exit(1);
  }
  if (senha.length < 12) {
    // 12 caracteres não é capricho: com scrypt, o que quebra uma senha curta é
    // dicionário, e nenhum custo de KDF salva "Senha123".
    console.error("\nUse ao menos 12 caracteres. Nada foi gravado.");
    process.exit(1);
  }

  const passwordHash = hashPassword(senha);
  const [existente] = await db.select().from(users).where(eq(users.email, email));

  if (existente) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existente.id));
    console.log(`\nSenha atualizada para ${email} (papel: ${existente.role}).`);
  } else {
    const [novo] = await db
      .insert(users)
      .values({ email, name: email.split("@")[0], passwordHash, role: "operator" })
      .returning();
    console.log(`\nOperador criado: ${novo.email} (${novo.id}).`);
  }

  fecharPrompt();
  await pool.end();
}

main().catch(async (err) => {
  fecharPrompt();
  console.error(err);
  await pool.end();
  process.exit(1);
});
