# Database Seeder Guide

The seeder writes deterministic demo data directly through Prisma. All rows managed by the seeder use stable `seed_` IDs, so rerunning a seed command restores that segment to its default values.

## Commands

Run commands from `villahermosadentalclinic-server`.

```bash
npm run seed
```

Seeds everything in dependency order: payment methods, doctors/staff, patients, appointments with logs/payments/finance rows, inventory, and standalone finance expenses.

To list all seeder commands with short explanations:

```bash
npm run seed:list
```

Segmented seed commands:

```bash
npm run seed:patients
npm run seed:doctors
npm run seed:staff
npm run seed:inventory
npm run seed:appointments
npm run seed:finance
npm run seed:payment-methods
```

Segmented delete commands:

```bash
npm run delete:patients
npm run delete:doctors
npm run delete:staff
npm run delete:inventory
npm run delete:appointments
npm run delete:finance
npm run delete:payment-methods
npm run delete:all
```

## Dependency Rules

- `seed:appointments` requires the seeded patients and doctors/staff to already exist. It also restores payment methods and status config.
- `seed:appointments` includes appointment logs, payments, appointment payment finance records, and appointment notifications.
- `seed:finance` requires seeded patients and appointments because one default finance expense references a patient and appointment snapshot.
- `delete:patients` and `delete:doctors` remove dependent seeded appointments first so the remaining seed data is not orphaned.
- `delete:appointments` removes seeded appointment logs, payments, appointment payment finance rows, and appointment notifications.

## Useful Logins

- Admin: `admin` / `password`
- Test Doctor shortcut: `doctor` / `password`
- Doctor email login: `maria.villahermosa@example.com` / `doctor123`
- Receptionist login: `carlo.mendoza@example.com` / `password`
- Test Patient login: `test@patient.com` / `villahermosa123`
