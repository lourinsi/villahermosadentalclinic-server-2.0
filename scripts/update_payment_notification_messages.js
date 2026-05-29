const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'villahermosa backend data');
const notificationsFile = path.join(dataDir, 'notifications.json');
const appointmentsFile = path.join(dataDir, 'appointments.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
function backup(file) { const bak = file + '.bak.' + Date.now(); fs.copyFileSync(file, bak); return bak; }

function main() {
  if (!fs.existsSync(notificationsFile) || !fs.existsSync(appointmentsFile)) {
    console.error('Missing data files.');
    process.exit(1);
  }

  const notifications = readJson(notificationsFile);
  const appointments = readJson(appointmentsFile);
  const aptMap = new Map(appointments.map(a => [String(a.id), a]));

  const updated = [];

  const paymentRegex = /Your payment of\s*₱?([\d,\.]+)\s*was successful\.?\s*Your appointment on\s*([0-9-]{10})/i;

  notifications.forEach(n => {
    try {
      if (!n || !n.metadata || !n.metadata.appointmentId) return;
      const aid = String(n.metadata.appointmentId);
      const apt = aptMap.get(aid);
      if (!apt) return;

      if (typeof n.message === 'string') {
        const m = n.message.match(paymentRegex);
        if (m) {
          const amount = m[1];
          // Build new message using current appointment date and status
          const statusText = apt.status === 'scheduled' || apt.status === 'confirmed' ? 'scheduled' : apt.status;
          const newMsg = `Your payment of ₱${amount} was successful. Your appointment on ${apt.date} is now ${statusText}.`;
          if (n.message !== newMsg) {
            n.message = newMsg;
            n.metadata.appointmentDate = apt.date;
            n.metadata.appointmentTime = apt.time;
            n.metadata.currentStatus = apt.status;
            n.updatedAt = new Date().toISOString();
            n.isRead = false;
            updated.push(n.id);
          }
        }
      }
    } catch (err) {
      console.error('Error processing', n && n.id, err);
    }
  });

  if (updated.length === 0) {
    console.log('No payment notification messages required updating.');
    return;
  }

  const bak = backup(notificationsFile);
  writeJson(notificationsFile, notifications);
  console.log('Backed up original to', bak);
  console.log('Updated messages for notifications:', updated.length);
  console.log(updated.join('\n'));
}

main();
