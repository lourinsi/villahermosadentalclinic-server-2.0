const fs = require('fs');
const path = require('path');

// Data folder (relative to repo root)
const dataDir = path.resolve(__dirname, '..', '..', 'villahermosa backend data');
const notificationsFile = path.join(dataDir, 'notifications.json');
const appointmentsFile = path.join(dataDir, 'appointments.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function backup(file) {
  const bak = file + '.bak.' + Date.now();
  fs.copyFileSync(file, bak);
  return bak;
}

function main() {
  if (!fs.existsSync(notificationsFile) || !fs.existsSync(appointmentsFile)) {
    console.error('Data files not found. Expected:', notificationsFile, appointmentsFile);
    process.exit(1);
  }

  const notifications = readJson(notificationsFile);
  const appointments = readJson(appointmentsFile);

  const aptMap = new Map();
  appointments.forEach(a => aptMap.set(String(a.id), a));

  const updated = [];

  notifications.forEach(n => {
    try {
      if (n && n.metadata && n.metadata.appointmentId) {
        const aid = String(n.metadata.appointmentId);
        const apt = aptMap.get(aid);
        if (apt) {
          const needsDate = !n.metadata.appointmentDate || !n.metadata.appointmentTime;
          if (needsDate) {
            n.metadata.appointmentDate = apt.date;
            n.metadata.appointmentTime = apt.time;
            // also ensure currentStatus and patientName are present
            n.metadata.currentStatus = apt.status || n.metadata.currentStatus;
            n.metadata.patientName = apt.patientName || n.metadata.patientName;
            n.updatedAt = new Date().toISOString();
            n.isRead = false;
            updated.push(n.id);
          }
        }
      }
    } catch (err) {
      console.error('Error processing notification', n && n.id, err);
    }
  });

  if (updated.length === 0) {
    console.log('No notifications required updating.');
    return;
  }

  const bak = backup(notificationsFile);
  writeJson(notificationsFile, notifications);

  console.log('Backed up original notifications to', bak);
  console.log('Updated notifications count:', updated.length);
  console.log(updated.join('\n'));
}

main();
