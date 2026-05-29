# Quick Start Guide

## Step 1: Start the Backend Server

```bash
cd villahermosadentalclinic-server
npm install
npm run dev
```

Expected output:
```
🚀 Server is running on http://localhost:3001
📍 Frontend URL: http://localhost:3000
```

## Step 2: Start the Frontend

In a new terminal:
```bash
cd villahermosadentalclinic
npm run dev
```

Frontend will run on `http://localhost:3000`

## Step 3: Test Adding a Patient

1. Open http://localhost:3000 in your browser
2. Navigate to the Dashboard or Patient section
3. Click "Add Patient" button
4. Fill out the form
5. Click "Add Patient" button
6. You should see a success toast notification

## Architecture Overview

```
┌─────────────────────────┐
│   Frontend (Next.js)    │
│  http://localhost:3000  │
└────────────┬────────────┘
             │
             │ HTTP/JSON
             │
┌────────────▼────────────┐
│  Backend (Express.js)   │
│  http://localhost:3001  │
│                         │
│  /api/patients (POST)   │
│  /api/patients (GET)    │
│  /api/patients/:id (GET)│
└─────────────────────────┘
```

## File Structure

```
villahermosadentalclinic-server/
├── src/
│   ├── controllers/
│   │   └── patientController.ts    # Patient logic
│   ├── routes/
│   │   └── patientRoutes.ts        # API routes
│   ├── types/
│   │   └── patient.ts              # TypeScript interfaces
│   └── index.ts                    # Main server file
├── package.json
├── tsconfig.json
└── README.md
```

## What's Working

✅ Add Patient API endpoint  
✅ Get All Patients endpoint  
✅ Get Patient by ID endpoint  
✅ Frontend form connected to backend  
✅ Success/error notifications  

## Next Steps

After confirming the add patient functionality works, we can add:
- Appointments management
- Schedule view integration
- Patient list display
- Database persistence
- Edit/Delete patient functionality
