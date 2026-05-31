import { prisma } from "../lib/prisma";

async function main() {
  console.log("Starting notifications backfill: appointmentId...");

  const batchSize = 200;
  let updated = 0;
  let processed = 0;

  while (true) {
    const rows = await prisma.notification.findMany({
      where: { appointmentId: null },
      take: batchSize,
    });

    if (rows.length === 0) break;

    for (const row of rows) {
      processed++;
      const meta = row.metadata as any;
      let candidate: any = undefined;

      if (meta) {
        candidate = meta.appointmentId || meta.appointment_id || meta.appointmentSnapshot?.id || meta.appointmentSnapshot?.appointmentId || meta.appointmentSnapshot?.appointment_id;
      }

      // If metadata is a string (rare), try parse
      if (!candidate && typeof row.metadata === "string") {
        try {
          const parsed = JSON.parse(row.metadata as unknown as string);
          candidate = parsed?.appointmentId || parsed?.appointment_id || parsed?.appointmentSnapshot?.id;
        } catch (e) {
          // ignore
        }
      }

      if (candidate) {
        try {
          await prisma.notification.update({
            where: { id: row.id },
            data: { appointmentId: String(candidate) },
          });
          updated++;
        } catch (err) {
          const msg = err && (err as any).message ? (err as any).message : String(err);
          console.warn(`Failed to update notification ${row.id}:`, msg);
        }
      }
    }

    console.log(`Processed ${processed} rows, updated ${updated} so far...`);
  }

  console.log(`Done. Processed ${processed} notifications, updated ${updated} appointmentId values.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
