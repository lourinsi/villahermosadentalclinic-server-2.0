const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'villahermosa backend data');
const appointmentsFile = path.join(dataDir, 'appointments.json');
const notificationsFile = path.join(dataDir, 'notifications.json');

function backup(file) {
  const bak = file + '.bak.' + Date.now();
  fs.copyFileSync(file, bak);
  return bak;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function normalizeAppointmentStatus(appt) {
  if (!appt || typeof appt !== 'object') return false;
  if (appt.status === 'confirmed') {
    appt.status = 'scheduled';
    return true;
  }
  return false;
}

function normalizeNotification(n) {
  let changed = false;
  if (!n || typeof n !== 'object') return false;
  if (n.metadata && n.metadata.currentStatus === 'confirmed') {
    n.metadata.currentStatus = 'scheduled';
    changed = true;
  }
  if (typeof n.message === 'string' && /\bconfirmed\b/i.test(n.message)) {
    // replace whole-word confirmed -> scheduled (case-insensitive)
    n.message = n.message.replace(/\bconfirmed\b/gi, 'scheduled');
    changed = true;
  }
  // Also update appointmentDate/time fields if missing (leave as-is otherwise)
  return changed;
}

function main() {
  if (!fs.existsSync(appointmentsFile) || !fs.existsSync(notificationsFile)) {
    console.error('Data files not found in', dataDir);
    process.exit(1);
  }

  console.log('Backing up files...');
  const aBak = backup(appointmentsFile);
  const nBak = backup(notificationsFile);
  console.log('Backups created:', aBak, nBak);

  const appointments = readJson(appointmentsFile);
  const notifications = readJson(notificationsFile);

  let apptChangedIds = [];
  if (Array.isArray(appointments)) {
    appointments.forEach((apt) => {
      const changed = normalizeAppointmentStatus(apt);
      if (changed && apt.id) apptChangedIds.push(apt.id);
    });
  }

  let notifChangedIds = [];
  if (Array.isArray(notifications)) {
    notifications.forEach((n) => {
      const changed = normalizeNotification(n);
      if (changed && n.id) notifChangedIds.push(n.id);
    });
  }

  // Write back only if changes detected
  if (apptChangedIds.length > 0) {
    writeJson(appointmentsFile, appointments);
  }
  if (notifChangedIds.length > 0) {
    writeJson(notificationsFile, notifications);
  }

  console.log('Backfill complete:');
  console.log('  Appointments updated:', apptChangedIds.length);
  if (apptChangedIds.length) console.log('    IDs:', apptChangedIds.slice(0, 50).join(', '));
  console.log('  Notifications updated:', notifChangedIds.length);
  if (notifChangedIds.length) console.log('    IDs:', notifChangedIds.slice(0, 50).join(', '));
  console.log('Notes: backups left at:', aBak, nBak);
}

main();
