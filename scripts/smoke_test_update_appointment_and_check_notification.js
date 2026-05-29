const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const body = opts.body ? JSON.stringify(opts.body) : undefined;
      const headers = opts.headers || {};
      if (body) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      const requestOptions = {
        method: opts.method || 'GET',
        headers,
      };

      const req = lib.request(u, requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          const result = {
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => data,
            json: async () => {
              try { return data ? JSON.parse(data) : {}; } catch (e) { return { raw: data }; }
            }
          };
          resolve(result);
        });
      });

      req.on('error', (err) => reject(err));
      if (body) req.write(body);
      req.end();
    } catch (err) { reject(err); }
  });
}

const dataDir = path.resolve(__dirname, '..', '..', 'villahermosa backend data');
const notificationsFile = path.join(dataDir, 'notifications.json');

async function main() {
  // 1) Fetch a list of appointments via API
  const apptRes = await fetch('http://localhost:3001/api/appointments');
  const apptJson = await apptRes.json();
  const appts = apptJson.data || [];
  if (!appts || appts.length === 0) {
    console.error('No appointments available for smoke test');
    process.exit(1);
  }

  // pick the first appointment that has a patientId
  const apt = appts.find(a => a.patientId);
  if (!apt) {
    console.error('No appointment with patientId available');
    process.exit(1);
  }

  console.log('Selected appointment:', apt.id, 'patientId=', apt.patientId, 'status=', apt.status);

  // find corresponding notification for this appointment + patient
  const notifications = JSON.parse(fs.readFileSync(notificationsFile,'utf8'));
  const notif = notifications.find(n => n.metadata && n.metadata.appointmentId === apt.id && n.userId === apt.patientId);
  if (!notif) {
    console.error('No existing notification found for this appointment and patient — cannot verify update flow');
    process.exit(1);
  }

  console.log('Found notification id=', notif.id, 'updatedAt=', notif.updatedAt, 'isRead=', notif.isRead);

  // 2) Update appointment date/time by sending a PUT to the API
  const newDate = new Date();
  newDate.setDate(newDate.getDate() + 7);
  const newDateStr = newDate.toISOString().split('T')[0];
  const newTime = '09:00';

  console.log('Updating appointment', apt.id, 'to', newDateStr, newTime);
  const updateRes = await fetch(`http://localhost:3001/api/appointments/${apt.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: { date: newDateStr, time: newTime }
  });

  const updateJson = await updateRes.json();
  if (!updateJson.success) {
    console.error('Appointment update failed:', updateJson);
    process.exit(1);
  }

  console.log('Appointment updated. Waiting 1s for notification update...');
  await new Promise(r => setTimeout(r, 1000));

  // 3) Reload notifications.json and find that notification
  const notifications2 = JSON.parse(fs.readFileSync(notificationsFile,'utf8'));
  const notif2 = notifications2.find(n => n.metadata && n.metadata.appointmentId === apt.id && n.userId === apt.patientId);
  if (!notif2) {
    console.error('Notification disappeared after update — unexpected');
    process.exit(1);
  }

  console.log('After update: notification id=', notif2.id, 'updatedAt=', notif2.updatedAt, 'isRead=', notif2.isRead);

  if (notif2.isRead === false && (new Date(notif2.updatedAt) > new Date(notif.updatedAt))) {
    console.log('Smoke test PASS: notification was updated and marked unread');
    process.exit(0);
  }

  console.error('Smoke test FAIL: notification not updated as expected');
  process.exit(2);
}

main().catch(err => { console.error(err); process.exit(1); });
