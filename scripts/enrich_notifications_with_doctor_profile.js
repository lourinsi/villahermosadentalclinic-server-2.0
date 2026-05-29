const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'villahermosa backend data');
const notificationsFile = path.join(dataDir, 'notifications.json');
const appointmentsFile = path.join(dataDir, 'appointments.json');
const staffFile = path.join(dataDir, 'staff.json');

function backup(file) {
  const bak = file + '.bak.' + Date.now();
  fs.copyFileSync(file, bak);
  return bak;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }

function findStaffProfile(doctorName, staffList) {
  if (!doctorName) return undefined;
  const byName = staffList.find(s => s.name === doctorName || s.displayName === doctorName);
  if (byName) return byName.profilePicture || byName.profilePictureUrl || byName.avatar;
  // try by partial match
  const lower = doctorName.toLowerCase();
  const partial = staffList.find(s => (s.name && s.name.toLowerCase().includes(lower)) || (s.email && s.email.toLowerCase().includes(lower)));
  if (partial) return partial.profilePicture || partial.profilePictureUrl || partial.avatar;
  return undefined;
}

function main() {
  if (!fs.existsSync(notificationsFile) || !fs.existsSync(appointmentsFile) || !fs.existsSync(staffFile)) {
    console.error('Missing one of the data files in', dataDir);
    process.exit(1);
  }

  console.log('Backing up notifications file...');
  const bak = backup(notificationsFile);
  console.log('Backup created:', bak);

  const notifications = readJson(notificationsFile);
  const appointments = readJson(appointmentsFile);
  const staff = readJson(staffFile);

  const aptMap = new Map((appointments || []).map(a => [String(a.id), a]));

  const changed = [];

  notifications.forEach(n => {
    try {
      if (!n || !n.metadata || !n.metadata.appointmentId) return;
      const aid = String(n.metadata.appointmentId);
      const apt = aptMap.get(aid);
      if (!apt) return;
      const doctorName = apt.doctor;
      const profile = findStaffProfile(doctorName, staff || []);
      let didChange = false;

      if (profile && n.metadata.doctorProfile !== profile) {
        n.metadata.doctorProfile = profile;
        didChange = true;
      }

      // ensure appointmentDate/time fields exist and match current appointment
      if (n.metadata.appointmentDate !== apt.date) {
        n.metadata.appointmentDate = apt.date;
        didChange = true;
      }
      if (n.metadata.appointmentTime !== apt.time) {
        n.metadata.appointmentTime = apt.time;
        didChange = true;
      }

      if (didChange) {
        n.updatedAt = new Date().toISOString();
        n.isRead = false;
        changed.push(n.id);
      }
    } catch (err) {
      // continue
    }
  });

  if (changed.length > 0) {
    writeJson(notificationsFile, notifications);
  }

  console.log('Enrichment complete. Notifications updated:', changed.length);
  if (changed.length) console.log('IDs:', changed.slice(0, 100).join(', '));
  console.log('Backup: ', bak);
}

main();
