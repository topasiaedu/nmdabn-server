# Quick Start Guide

Get the main backend server running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Supabase account with a project
- Google Cloud Console account (for OAuth)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
PORT=3000
NODE_ENV=development
```

### Getting Supabase Credentials

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Go to Settings → API
4. Copy:
   - **URL**: Your project URL
   - **service_role key**: The service role key (keep this secret!)

### Getting Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable APIs:
   - Google Sheets API
   - Google Drive API
4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
5. Application type: **Web application**
6. Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
7. Copy Client ID and Client Secret

## Step 3: Set Up Database

Make sure your Supabase database has the schema defined in `database.types.ts`.

You can apply the schema using Supabase SQL Editor or migration tools.

## Step 4: Start the Server

```bash
npm run dev
```

You should see:

```
============================================================
🚀 Main Backend Server Started
============================================================
Environment: development
Port: 3000
Supabase URL: https://your-project.supabase.co
============================================================
```

## Step 5: Test the Server

### Health Check

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "development"
}
```

### Test Google OAuth (Optional)

1. Get a Supabase JWT token (from your frontend or Supabase Auth)
2. Request authorization URL:

```bash
curl -X GET "http://localhost:3000/api/auth/google/authorize?workspace_id=YOUR_WORKSPACE_ID&state=test" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT"
```

3. Visit the returned `authUrl` in your browser
4. Complete the OAuth flow

## Common Issues

### "Missing required environment variables"

- Make sure `.env` file exists and has all required variables
- Check for typos in variable names
- Restart the server after changing `.env`

### "Cannot connect to Supabase"

- Verify `SUPABASE_URL` is correct
- Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key (not anon key)
- Check internet connection
- Verify Supabase project is active

### "Google OAuth fails"

- Verify redirect URI matches exactly: `http://localhost:3000/api/auth/google/callback`
- Make sure Google Sheets API and Drive API are enabled
- Check Client ID and Secret are correct
- Try regenerating OAuth credentials

### Port already in use

Change the port in `.env`:
```env
PORT=3001
```

## Next Steps

1. **Read the API Documentation**: See `API_EXAMPLES.md` for detailed API usage
2. **Set Up Microservices**: Deploy the integration microservices (Zoom, VAPI, Google Sheets)
3. **Configure Webhooks**: Set up webhook endpoints in external services
4. **Build Frontend**: Connect your frontend application to these APIs

## Development Tips

### Auto-Reload

The dev server uses `ts-node-dev` for automatic reloading. Just save your files and the server restarts.

### Debugging

Add `console.log()` statements or use VS Code debugger:

1. Add breakpoints in VS Code
2. Run: Debug → Start Debugging (F5)
3. Select "Node.js" when prompted

### Testing Endpoints

Use tools like:
- **curl** (command line)
- **Postman** (GUI)
- **Insomnia** (GUI)
- **Thunder Client** (VS Code extension)

### Viewing Logs

All requests are logged automatically:
```
[2024-01-15T10:30:00.000Z] GET /health
[2024-01-15T10:30:05.000Z] POST /api/actions/google-sheets/append-row
```

## Project Structure Overview

```
src/
├── config/          # Configuration (Supabase, env vars)
├── middleware/      # Authentication, workspace validation
├── routes/          # API endpoints
├── services/        # Business logic (jobs, accounts)
├── types/           # TypeScript types
└── index.ts         # Main entry point
```

## Useful Commands

```bash
# Development with auto-reload
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Type checking only (no compilation)
npm run type-check
```

## Getting Help

- Check `README.md` for full documentation
- See `API_EXAMPLES.md` for API usage examples
- Review `DEPLOYMENT.md` for production deployment
- Check the logs for error messages

## What's Next?

Now that your server is running, you can:

1. **Create integration accounts** via the API
2. **Connect Google accounts** using OAuth flow
3. **Create jobs** for microservices to execute
4. **Receive webhooks** from external services
5. **Build your frontend** to interact with these APIs

Happy coding! 🚀

