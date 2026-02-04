# 30-Day Property Management System Rebuild Roadmap

**Constraint:** Complete Full UI Build in the first 6 Days.
**Tech Stack:** React (Vite/TS), Node.js (Express), MySQL.

---

## 🚀 Phase 1: High-Velocity UI Build (Days 1-6)
**Goal:** A fully styled, responsive, and clickable frontend. All pages, modals, and states should be visible (using mock data if needed). No Backend integration yet.

| Day | Focus Area | Key Deliverables (Frontend Only) |
| :--- | :--- | :--- |
| **Day 1** | **Design System & Layouts** | • Setup Tailwind Config (Colors, Fonts). <br> • Build Core UI Components (Button, Input, Card, Modal, Badge, Table). <br> • Implement `AppLayout` (Sidebar, Navbar, Mobile Menu) & `AuthLayout`. <br> • Setup React Router with all empty page routes. |
| **Day 2** | **Public & Auth Views** | • **Landing Page:** Hero section, Featured Properties grid. <br> • **Property Details:** Image carousel, Amenities list, "Apply Now" modal. <br> • **Auth:** Login, Register, Forgot Password forms. <br> • **Error Pages:** 404, 500, Unauthorized designs. |
| **Day 3** | **Dashboard Core** | • **Dashboard Home:** Stats cards (Occupancy, Revenue), Recent Activity feed, Charts placeholder. <br> • **Property Management:** Property List (Grid/List toggle), Unit List, Add/Edit Property Multi-step Form. |
| **Day 4** | **CRM & Leasing UI** | • **Leads Pipeline:** Kanban board or List view for leads (New -> Contacted -> Viewing). <br> • **Visits:** Calendar view/List view for scheduled viewings. <br> • **Lease Management:** Active Leases table, Lease Details view, Lease Generation Form/Wizard. |
| **Day 5** | **Operations & Interactions** | • **Maintenance:** Request styling (Status badges), Chat interface for tickets, Staff Assignment modal. <br> • **Tenant Portal:** "My Lease" view, "Pay Rent" checkout flow mock, Request History. <br> • **Notifications:** Dropdown UI and dedicated Notifications page. |
| **Day 6** | **Financials & Polish** | • **Financial:** Invoices Table, Invoice Design (PDF view), Payment History, Receipt view. <br> • **Reports:** Reports Dashboard layout with date pickers and filters. <br> • **Responsiveness:** Full pass on Mobile/Tablet breakpoints. |

---

## 🏗️ Phase 2: Foundation & Assets (Days 7-12)
**Goal:** Working Database, Authentication, and Property Management API.

| Day | Focus Area | Key Tasks |
| :--- | :--- | :--- |
| **Day 7** | **DB & Server Setup** | • Initialize Express, `dotenv`. <br> • Create MySQL Schema (`users`, `properties`, `units`). <br> • Setup Database Connection (`db.js`). |
| **Day 8** | **Authentication** | • backend: `authController` (Login/Register). <br> • backend: `authMiddleware` (JWT verification). <br> • frontend: Connect Auth forms to API. |
| **Day 9** | **Properties API** | • backend: `propertyController` (CRUD). <br> • database: `properties` & `property_images` tables. <br> • frontend: Integrate Property List & Details. |
| **Day 10** | **Units & Types** | • backend: `unitController`, `unitTypeController`. <br> • frontend: Integrate Unit management. |
| **Day 11** | **Image Handling** | • backend: Setup `multer` for uploads. <br> • frontend: Integrate Image Uploaders for Properties/Units. |
| **Day 12** | **Validation & Catch-up** | • Implement Joi Validation for existing routes. <br> • Fix any UI/API disconnects from Days 7-11. |

---

## 🤝 Phase 3: CRM & Leasing Engine (Days 13-20)
**Goal:** Full Lead-to-Lease lifecycle working.

| Day | Focus Area | Key Tasks |
| :--- | :--- | :--- |
| **Day 13** | **Leads System** | • backend: `leadController` (Capture APIs). <br> • frontend: Connect Public "Contact Us" forms. |
| **Day 14** | **Visits & Scheduling** | • backend: `visitController`. <br> • frontend: Integrate Visit scheduling & Admin Visit Calendar. |
| **Day 15** | **Applications & Screening** | • backend: Logic to convert Lead -> Tenant. <br> • frontend: Convert "Apply" modals to real API calls. |
| **Day 16** | **Lease Generation** | • database: `leases` table. <br> • backend: `createLease` logic (dates, rent amount, security deposit). |
| **Day 17** | **Lease Active State** | • backend: Logic for Lease Activation. <br> • frontend: Tenant Dashboard showing active lease data. |
| **Day 18** | **Lease Termination** | • backend: `terminateLease` logic (Move-out inspections, Deposit returns). |
| **Day 19** | **PDF Generation** | • backend: `pdfService` setup (`pdfkit`). <br> • backend: Generate Lease Agreement PDF. |
| **Day 20** | **Notifications (Email)** | • backend: Setup `nodemailer`. <br> • Trigger emails on Lead created, Visit scheduled, Lease signed. |

---

## 💰 Phase 4: Financial Engine (Days 21-26)
**Goal:** Automation of Money. Invoices, Payments, Receipts.

| Day | Focus Area | Key Tasks |
| :--- | :--- | :--- |
| **Day 21** | **Invoicing System** | • database: `invoices`, `invoice_items`. <br> • backend: Manual Invoice creation API. |
| **Day 22** | **Recurring Billing** | • backend: `node-cron` setup. <br> • logic: Auto-generate rent invoices on the 1st of the month. |
| **Day 23** | **Payments** | • database: `payments` table. <br> • backend: `paymentController` (Record payment, Update Invoice Status). |
| **Day 24** | **Receipts & History** | • backend: Auto-generate Receipt PDF on payment. <br> • frontend: "Pay Now" logic connecting to Payment API. |
| **Day 25** | **Owner Payouts** | • backend: Calculate Management Fees. <br> • frontend: Owner Dashboard financial overview. |
| **Day 26** | **Financial Reporting** | • frontend: Integrate Charts with real financial data (Revenue vs Expenses). |

---

## 🛠️ Phase 5: Operations & Polish (Days 27-30)
**Goal:** Maintenance workflows, Reports, and Final Launch.

| Day | Focus Area | Key Tasks |
| :--- | :--- | :--- |
| **Day 27** | **Maintenance** | • backend: `maintenanceController`. <br> • frontend: Connect Maintenance Kanban/List. |
| **Day 28** | **Advanced Reports** | • backend: Aggregated data endpoints (Occupancy rates, Arrears). <br> • frontend: Finalize Reports Page exports. |
| **Day 29** | **Testing & Cleanup** | • Run full Lead-to-Lease-to-Move-out flows. <br> • Remove console logs, optimize images. |
| **Day 30** | **Deployment Prep** | • Environment variables audit. <br> • Build scripts verification. <br> • **PROJECT COMPLETE**. |
