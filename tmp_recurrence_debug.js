require('dotenv/config');
const { prisma } = require('./src/lib/prisma');
(async () => {
  try {
    const seriesId = 'rec_series_apt_1780571981938_755_2027-01-02';
    const occs = await prisma.recurringOccurrence.findMany({ where: { seriesId }, orderBy: [{ sequence: 'asc' }] });
    console.log('occurrences', JSON.stringify(occs.map(o => ({ id: o.id, appointmentId: o.appointmentId, sequence: o.sequence, status: o.status, generatedForDate: o.generatedForDate, parentAppointmentId: o.parentAppointmentId })), null, 2));
    const apps = await prisma.appointment.findMany({ where: { id: { in: occs.map(o => o.appointmentId) } }, orderBy: [{ date: 'asc' }] });
    console.log('appointments', JSON.stringify(apps.map(a => ({ id: a.id, date: a.date, status: a.status, recurringSeriesId: a.recurringSeriesId, isRecurring: a.isRecurring })), null, 2));
      const appointmentIds = ['apt_1780571981938_755','apt_1780571984167_342','apt_1780571984932_668'];
      for (const id of appointmentIds) {
        const app = await prisma.appointment.findUnique({ where: { id } });
        console.log('APPT', id, JSON.stringify(app, null, 2));
      }
      const ids = ['rec_series_apt_1780571981938_755_2027-01-02','rec_series_apt_1780571984932_668_2027-01-16'];
    for (const id of ids) {
      const series = await prisma.recurringSeries.findUnique({ where: { id } });
      console.log('SERIES', id, JSON.stringify(series, null, 2));
      const occs = await prisma.recurringOccurrence.findMany({ where: { seriesId: id }, orderBy: [{ sequence: 'asc' }, { generatedForDate: 'asc' }] });
      console.log('OCCS', id, JSON.stringify(occs.map(o => ({ id: o.id, appointmentId: o.appointmentId, sequence: o.sequence, status: o.status, generatedForDate: o.generatedForDate, parentAppointmentId: o.parentAppointmentId })), null, 2));
    }
    const logs = await prisma.appointmentLog.findMany({ where: { appointmentId: 'apt_1780571984167_342' }, orderBy: [{ changedAt: 'asc' }] });
    console.log('LOGS apt_1780571984167_342', JSON.stringify(logs.map(l => ({ id: l.id, changedAt: l.changedAt, changeType: l.changeType, notes: l.notes, previousState: l.previousState, newState: l.newState })), null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    if (prisma) await prisma.$disconnect();
  }
})();
