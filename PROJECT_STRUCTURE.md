# Vehicle Service Project Structure

This project is now structured around a `vehicle service history` use case.

## Core idea

- A mechanic can add a vehicle when it arrives at the workshop
- Multiple service records can be stored for the same vehicle
- A customer can review service history through their account or linked phone number

## Backend structure

- `backend/controllers/userController.js`
  Authentication, signup, login, and profile
- `backend/controllers/vehicleController.js`
  Vehicle registration and vehicle listing
- `backend/controllers/serviceRecordController.js`
  Service history creation and listing
- `backend/routes/userRoutes.js`
  `/api/users/*`
- `backend/routes/vehicleRoutes.js`
  `/api/vehicles/*`
- `backend/routes/serviceRecordRoutes.js`
  `/api/service-records/*`
- `backend/init/initDb.js`
  Tables: `users`, `vehicles`, `service_records`

## Database flow

1. `users`
   Roles: `customer`, `mechanic`, `admin`
2. `vehicles`
   Vehicle details, owner details, and the user who created the record
3. `service_records`
   Repair and service history linked to a vehicle

## Frontend structure

- `frontend/src/pages/Login.js`
  Login screen
- `frontend/src/pages/Signup.js`
  Role-based signup
- `frontend/src/pages/Dashboard.js`
  Vehicles and service history overview
- `frontend/src/pages/AddVehicle.js`
  Vehicle registration form
- `frontend/src/pages/AddServiceRecord.js`
  Service entry form
- `frontend/src/pages/Profile.js`
  Logged-in user profile and quick stats

## Recommended next steps

1. Build a vehicle details page using `vehicleId`
2. Show all service records for a vehicle in a timeline layout
3. Add search by registration number
4. Add service record editing and status updates
5. Add image and bill uploads
6. Build a dedicated customer history page
