#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node inspectAppointment.js <appointmentId>'); process.exit(1); }
  const connectionString = process.env.DATABASE_URL;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query('SELECT * FROM appointments WHERE id = $1', [id]);
    console.dir(res.rows[0], { depth: null });
  } catch (e) { console.error(e); }
  await client.end();
}
main();
