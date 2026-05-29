# Database Seeder Guide

## Overview
The seeder script generates random dummy data for testing and development purposes. It creates realistic patient and appointment records that you can use to populate your database without manual data entry.

## What Gets Seeded
- **25 Patients** with:
  - Names, emails, phone numbers
  - Dates of birth
  - Addresses with cities and states
  - Insurance information
  - Allergies and medical history
  - Account balances
  - Status (active, inactive, overdue)

- **60 Appointments** with:
  - Random dates (up to 6 months in future)
  - Times (8 AM - 5 PM)
  - Associated patient information
  - Doctor assignments
  - Appointment types (Cleaning, Checkup, Filling, etc.)
  - Status (add-to-cart, reserved, scheduled, completed)

## Prerequisites
1. Backend server must be running
2. Node.js and npm installed
3. TypeScript dependencies installed (`npm install`)

## How to Use

### Step 1: Start the Backend Server
```bash
cd villahermosadentalclinic-server
npm run dev
```

Wait for the message: `🚀 Server is running on http://localhost:3001`

### Step 2: Run the Seeder (in a new terminal)
```bash
cd villahermosadentalclinic-server
npm run seed
```

### Expected Output
```
🚀 Villahermosa Dental Clinic - Database Seeder
==================================================

✅ Server is running

🌱 Generating seeder data...

✅ Generated 25 patients

✅ Generated 60 appointments

📤 Adding patients to database via API...
✅ All patients added

📤 Adding appointments to database via API...
✅ All appointments added

📊 Seeding Summary:
   ✅ Total Patients Added: 25
   ✅ Total Appointments Added: 60

✨ Database seeding completed successfully!
🎉 You can now refresh your application to see the new data.
```

### Step 3: View the Data
Refresh your application in the browser to see all the new patients and appointments!

## Troubleshooting

### "Server is not running!" error
- Make sure you started the backend server with `npm run dev` first
- Check that the server is actually listening on `http://localhost:3001`
- Verify no other application is using port 3001

### "Failed to add patient/appointment" errors
- Check that the backend server is still running
- Look at the server console for any error messages
- Make sure the POST endpoints are working correctly

### Want to Seed Again?
Just run `npm run seed` again! The seeder will add more random data (new IDs each time).

## Notes
- The seeder data is completely random each time you run it
- Patient IDs and appointment IDs are generated with timestamps to ensure uniqueness
- All dates are within reasonable ranges (births 1960-2005, appointments up to 6 months out)
- The seeder only creates data; it doesn't clear existing data
- If you want to start fresh, you'll need to restart the server (which clears in-memory storage)

## Customization
To modify what gets seeded, edit `src/seeder.ts`:
- Change `generatePatients(25)` to a different number
- Change `generateAppointments(generatedPatients, 60)` to a different number
- Modify the sample data arrays (firstNames, lastNames, doctors, etc.)
