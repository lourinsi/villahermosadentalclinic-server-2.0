#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const appointmentId = process.argv[2];
  if (!appointmentId) {
    console.error('Usage: node inspectAppointmentLogs.js <appointmentId>');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set in the environment');
    process.exit(2);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM appointment_logs WHERE "appointmentId" = $1 ORDER BY "changedAt" DESC', [appointmentId]);
    if (!res.rows.length) {
      console.log('No logs found for appointment', appointmentId);
      return;
    }

    console.log(`Found ${res.rows.length} log(s) for appointment ${appointmentId}`);
    for (const row of res.rows) {
      console.log('---');
      console.log('id:', row.id);
      console.log('changedAt:', row.changedat || row.changedAt);
      console.log('changeType:', row.changetype || row.changeType);
      console.log('changedByName:', row.changedbyname || row.changedByName);
      console.log('previousState:');
      try { console.dir(typeof row.previousstate === 'string' ? JSON.parse(row.previousstate) : row.previousstate, { depth: 2 }); } catch(e) { console.dir(row.previousstate); }
      console.log('newState:');
      try { console.dir(typeof row.newstate === 'string' ? JSON.parse(row.newstate) : row.newstate, { depth: 2 }); } catch(e) { console.dir(row.newstate); }
    }
  } catch (err) {
    console.error('Error querying appointment logs:', err);
    process.exit(3);
  } finally {
    await client.end();
  }
}

main();
