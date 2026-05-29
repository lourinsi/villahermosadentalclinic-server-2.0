# Villahermosa Dental Clinic - Backend Server

Express.js backend API for the Villahermosa Dental Clinic management system.

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your settings:
   ```
   PORT=3001
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   
   The server will run on `http://localhost:3001`

### Available Scripts

- `npm run dev` - Start development server with hot reload (using ts-node)
- `npm run build` - Compile TypeScript to JavaScript
- `npm start` - Run the compiled production build
- `npm run lint` - Run ESLint

## API Endpoints

### Authentication

#### Register a new patient
- **POST** `/api/auth/register`
- **Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "555-555-5555"
  }
  ```
- **Response (Success):**
  ```json
  {
    "success": true,
    "message": "Patient registered successfully"
  }
  ```
- **Response (Error):**
  ```json
  {
    "success": false,
    "message": "A patient with this email or phone number already exists"
  }
  ```

#### Login
- **POST** `/api/auth/login`
- **Body:**
  ```json
  {
    "username": "john@example.com",
    "password": "villahermosa123"
  }
  ```
- **Response (Success):**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "token": "your-jwt-token",
    "user": {
        "username": "John Doe",
        "role": "patient",
        "patientId": "PATIENT-1705526848651"
    }
  }
  ```
- **Response (Error):**
  ```json
  {
    "success": false,
    "message": "Invalid credentials"
  }
  ```

### Patients

#### Add a new patient
- **POST** `/api/patients`
- **Body:**
  ```json
  {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "555-0123",
    "dateOfBirth": "1990-01-15",
    "address": "123 Main St",
    "city": "San Francisco",
    "zipCode": "94102",
    "insurance": "Blue Cross",
    "emergencyContact": "Jane Doe",
    "emergencyPhone": "555-0124",
    "medicalHistory": "No major surgeries",
    "allergies": "Penicillin",
    "notes": "Prefers morning appointments"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "message": "Patient added successfully",
    "data": {
      "id": "patient_1234567890",
      "firstName": "John",
      "lastName": "Doe",
      ...
      "createdAt": "2025-12-19T10:00:00Z",
      "updatedAt": "2025-12-19T10:00:00Z"
    }
  }
  ```

#### Get all patients
- **GET** `/api/patients`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Patients retrieved successfully",
    "data": [...]
  }
  ```

#### Get patient by ID
- **GET** `/api/patients/:id`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Patient retrieved successfully",
    "data": {...}
  }
  ```

### Health Check

#### Server health status
- **GET** `/api/health`
- **Response:**
  ```json
  {
    "status": "Server is running",
    "timestamp": "2025-12-19T10:00:00Z"
  }
  ```

## Current Status

⚠️ **Note:** This is using in-memory storage for development. Data will be lost when the server restarts.

### Next Steps

- [ ] Connect to database (MongoDB/PostgreSQL)
- [ ] Add authentication/authorization
- [ ] Add appointment endpoints
- [ ] Add scheduling logic
- [ ] Add file upload for patient documents
- [ ] Add validation middleware
- [ ] Add error logging
- [ ] Deploy to production

## Troubleshooting

### Port already in use
If port 3001 is already in use:
1. Change the PORT in `.env`
2. Update the frontend's API URL accordingly

### CORS errors
Make sure the `FRONTEND_URL` in `.env` matches your frontend URL (default: http://localhost:3000)

### Module not found
Run `npm install` to ensure all dependencies are installed
