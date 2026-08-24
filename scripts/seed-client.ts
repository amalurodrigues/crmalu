import "dotenv/config";
import { db, clients, adAccounts } from "@tego/db";
import { eq } from "drizzle-orm";

async function main() {
  const slug = "aluizio-paula";

  let [client] = await db.select().from(clients).where(eq(clients.slug, slug));
  if (!client) {
    [client] = await db
      .insert(clients)
      .values({
        name: "Aluízio Paula (Advocacia)",
        slug,
        segment: "juridico",
        funnelType: "leadgen",
      })
      .returning();
    console.log(`Cliente criado: ${client.name} (${client.id})`);
  } else {
    console.log(`Cliente já existia: ${client.name} (${client.id})`);
  }

  const [existingAccount] = await db
    .select()
    .from(adAccounts)
    .where(eq(adAccounts.clientId, client.id));

  if (!existingAccount) {
    const [account] = await db
      .insert(adAccounts)
      .values({
        clientId: client.id,
        platform: "meta",
        name: "Aluízio Paula — Meta Ads",
        currency: "BRL",
        timezoneName: "America/Sao_Paulo",
      })
      .returning();
    console.log(`Conta de anúncio criada: ${account.id}`);
    console.log(`\nAD_ACCOUNT_ID=${account.id}`);
  } else {
    console.log(`Conta de anúncio já existia: ${existingAccount.id}`);
    console.log(`\nAD_ACCOUNT_ID=${existingAccount.id}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
