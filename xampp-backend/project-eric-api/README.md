# Project Eric — Backend API

The PHP 8 REST API that powers Project Eric. Handles authentication (JWT), OAuth, password reset, team management, and landing-page data.

## Quick Setup (One Step!)

### Step 1: Import Single SQL File
1. Open **phpMyAdmin**: http://localhost/phpmyadmin
2. Click **"Import"** tab
3. Choose the file: `database/setup.sql`
4. Click **"Go"**

That's it! Everything is created automatically:
- Database `project_eric`
- All 11 tables
- Features seed data
- Team members seed data
- Demo user account

---

## Demo Login Credentials
- **Email:** `demo@project-eric.com`
- **Password:** `demo123`

---

## API Endpoints

### Public Endpoints (No Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/landing` | Landing page data (features, team, stats) |
| GET | `/api/features` | All features |
| GET | `/api/team` | Team members |

### Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/oauth` | OAuth authentication |
| GET | `/api/auth/validate` | Validate JWT token |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Reset password |
| POST | `/api/auth/logout` | Invalidate the current session |

---

## Example API Requests

### Login
```bash
curl -X POST http://localhost/project-eric-api/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@project-eric.com", "password": "demo123"}'
```

### Get Landing Page Data
```bash
curl http://localhost/project-eric-api/api/landing
```

### Validate Token
```bash
curl http://localhost/project-eric-api/api/auth/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Troubleshooting

### Database Connection Error
- Verify MySQL is running in XAMPP Control Panel
- Default credentials: `root` / empty password

### 404 Not Found
- Files must be in: `C:\xampp\htdocs\project-eric-api\`
- Access URL: `http://localhost/project-eric-api/api/...`

### CORS Errors
- Update `SITE_URL` in `config/config.php` to match your frontend URL
- Default for Vite dev: `http://localhost:5173`

---

## Security Notes (Production)

1. **Change JWT Secret** in `config/config.php`
2. **Set strong database password** and update `config.php`
3. **Enable HTTPS** on production server
4. **Remove debug output** from error responses
