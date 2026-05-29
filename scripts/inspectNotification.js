#!/usr/bin/env node
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node inspectNotification.js <notificationId>');
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
    const res = await client.query('SELECT id, "createdAt", "updatedAt", "isLog", deleted, metadata FROM notifications WHERE id = $1', [id]);
    if (!res.rows.length) {
      console.log('Notification not found');
      return;
    }

    const row = res.rows[0];
    console.log('id:', row.id);
    console.log('createdAt:', row.created_at);
    console.log('updatedAt:', row.updated_at);
    console.log('isLog:', row.is_log);
    console.log('deleted:', row.deleted);
    console.log('metadata:');
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      console.dir(meta, { depth: null });
    } catch (e) {
      console.dir(row.metadata, { depth: null });
    }
  } catch (err) {
    console.error('Error querying notification:', err);
    process.exit(3);
  } finally {
    await client.end();
  }
}

main();
