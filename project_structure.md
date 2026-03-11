# Recommended Project Structure
**Stack:** React (Vite/JS) + Node.js (Express) + MySQL
**Style:** Feature-based organization for scalability.

---

## 📂 Root Directory
```text
/
├── backend/                # Node.js API
├── frontend/               # React Vite App
├── rebuild_roadmap.md      # Your 30-Day Plan
└── README.md
```

---

## 🖥️ Frontend Structure (`frontend/src`)
*Moved from TypeScript (.tsx) to JavaScript (.jsx)*

```text
frontend/
├── public/                 # Static assets (favicons, robots.txt)
├── src/
│   ├── assets/             # Images, Global CSS
│   ├── components/
│   │   ├── ui/             # Reusable "Atoms" (Buttons, Cards, Badges, Inputs)
│   │   ├── layout/         # App Shell (Sidebar.jsx, Navbar.jsx, AuthLayout.jsx)
│   │   └── common/         # Shared complex components (Modals, Tables)
│   ├── context/            # Global State (AuthContext.jsx, ThemeContext.jsx)
│   ├── hooks/              # Custom Hooks (useAuth.jsx, useFetch.jsx)
│   ├── pages/              # Views (Grouped by Module)
│   │   ├── auth/           # Login.jsx, Register.jsx
│   │   ├── dashboard/      # DashboardHome.jsx
│   │   ├── properties/     # PropertyList.jsx, PropertyDetails.jsx
│   │   ├── crm/            # Leads.jsx, Visits.jsx
│   │   ├── finance/        # Invoices.jsx, Payments.jsx
│   │   ├── maintenance/    # Requests.jsx
│   │   └── owner/          # Specific Owner views
│   ├── services/           # API Handling (axios/fetch wrappers)
│   │   ├── api.js          # Base axios instance
│   │   └── endpoints/      # (Optional) auth.js, properties.js, leases.js
│   ├── utils/              # Helpers (currencyFormat.js, dateUtils.js)
│   ├── App.jsx             # Main Component
│   ├── main.jsx            # Entry Point
│   └── routes.jsx          # Router Configuration
├── .env                    # Environment Variables (VITE_API_URL)
├── index.html
├── tailwind.config.js
└── vite.config.js
```

### 💡 Key Organization Rules
1.  **components/ui**: Small, dumb components. No API logic. Just props in, UI out. (e.g., `<Button variant="primary" />`).
2.  **pages/**: Smart components. They fetch data using `services/` or `hooks/` and pass it down to components.
3.  **services/**: All `fetch` or `axios` calls go here. Components should **never** call `fetch('http://...')` directly.

---

## ⚙️ Backend Structure (`backend/`)
*Standard MVC Pattern for Express*

```text
backend/
├── config/                 # Configuration (db.js, env vars)
├── controllers/            # Request Handlers (Req/Res logic)
│   ├── authController.js
│   ├── propertyController.js
│   └── ...
├── database/               # SQL Scripts
│   └── schema.sql          # Source of Truth
├── middleware/             # Express Middleware
│   ├── authMiddleware.js   # JWT Verification
│   ├── uploadMiddleware.js # Multer config
│   └── errorMiddleware.js  # Global Error Handling
├── models/                 # Database Interactions (SQL Queries)
│   ├── userModel.js        # findUserByEmail, createUser
│   ├── propertyModel.js
│   └── ...
├── routes/                 # Endpoint Definitions
│   ├── authRoutes.js       # router.post('/login', ...)
│   ├── propertyRoutes.js
│   └── ...
├── services/               # Complex Business Logic (Optional but Recommended)
│   ├── leaseService.js     # "Calculate pro-rated rent", "Handle termination"
│   └── pdfService.js       # PDF generation logic
├── utils/                  # Helpers
│   ├── emailSender.js      # Nodemailer wrapper
│   └── validators.js       # Joi Schemas
├── .env                    # Secrets (DB_PASS, JWT_SECRET)
└── server.js               # App Entry Point
```

### 💡 Key Organization Rules
1.  **Routes**: Only define endpoints (urls) and point to Controllers.
2.  **Controllers**: Validate input -> Call Model/Service -> Send Response. **No SQL queries here.**
3.  **Models**: **Only SQL queries.** No business logic (like standard calculations) should live here if possible.
4.  **Services**: (Optional) If a task is complex (e.g., Terminating a lease involves DB updates + Emails + Calculations), put it in a Service, called by the Controller.
