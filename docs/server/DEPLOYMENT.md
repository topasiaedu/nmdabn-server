# Deployment Guide

This guide covers deploying the main backend server to production.

## Pre-Deployment Checklist

- [ ] Database schema is applied to production Supabase instance
- [ ] Google OAuth credentials are configured for production domain
- [ ] Environment variables are set in production environment
- [ ] CORS origins are updated for production frontend URL
- [ ] Webhook URLs are configured in external services (Zoom, VAPI)

## Environment Variables

Ensure all required environment variables are set in your production environment:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
GOOGLE_CLIENT_ID=your-production-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-production-client-secret
GOOGLE_REDIRECT_URI=https://your-domain.com/api/auth/google/callback
PORT=3000
NODE_ENV=production
```

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select your project
3. Enable Google Sheets API and Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: `https://your-domain.com/api/auth/google/callback`
5. Copy Client ID and Client Secret to environment variables

## Deployment Options

### Option 1: Docker (Recommended)

Create a `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

Create a `.dockerignore`:

```
node_modules
dist
.env
.git
*.md
```

Build and run:

```bash
docker build -t nmdabn-server .
docker run -p 3000:3000 --env-file .env nmdabn-server
```

### Option 2: Cloud Platforms

#### Heroku

1. Install Heroku CLI
2. Create app:
   ```bash
   heroku create nmdabn-server
   ```
3. Set environment variables:
   ```bash
   heroku config:set SUPABASE_URL=https://...
   heroku config:set SUPABASE_SERVICE_ROLE_KEY=...
   # ... set all other variables
   ```
4. Deploy:
   ```bash
   git push heroku main
   ```

#### Railway

1. Connect GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Railway auto-deploys on push to main branch

#### Render

1. Create new Web Service
2. Connect GitHub repository
3. Set build command: `npm run build`
4. Set start command: `npm start`
5. Add environment variables in Render dashboard

#### AWS EC2

1. Launch EC2 instance (Ubuntu 22.04 recommended)
2. SSH into instance
3. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
4. Clone repository and install dependencies:
   ```bash
   git clone <your-repo>
   cd nmdabn-server
   npm install
   npm run build
   ```
5. Set environment variables:
   ```bash
   nano .env
   # Add all environment variables
   ```
6. Use PM2 for process management:
   ```bash
   sudo npm install -g pm2
   pm2 start dist/index.js --name nmdabn-server
   pm2 startup
   pm2 save
   ```
7. Configure Nginx as reverse proxy:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

### Option 3: Serverless (Vercel/Netlify)

Note: Requires adapting the Express app to serverless functions.

## Post-Deployment

### 1. Verify Health Endpoint

```bash
curl https://your-domain.com/health
```

Expected response:
```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "environment": "production"
}
```

### 2. Test Authentication

Try accessing a protected endpoint:

```bash
curl https://your-domain.com/api/integrations/accounts?workspace_id=test \
  -H "Authorization: Bearer invalid-token"
```

Should return 401 Unauthorized.

### 3. Configure Webhooks

#### Zoom Webhooks

1. Go to [Zoom Marketplace](https://marketplace.zoom.us/)
2. Navigate to your app's webhook configuration
3. Add webhook endpoint: `https://your-domain.com/api/webhooks/zoom`
4. Subscribe to events:
   - Meeting started
   - Meeting ended
   - Participant joined
   - Participant left
   - Recording completed

#### VAPI Webhooks

1. Go to VAPI dashboard
2. Navigate to webhook settings
3. Add webhook URL: `https://your-domain.com/api/webhooks/vapi`
4. Subscribe to events:
   - Call started
   - Call ended
   - Recording available

### 4. Update Frontend CORS

In `src/index.ts`, update CORS configuration:

```typescript
cors({
  origin: ['https://your-frontend-domain.com'],
  credentials: true,
})
```

Redeploy after making this change.

## Monitoring

### Logging

Production logs should be collected and monitored. Consider:

- **Papertrail**: Simple log aggregation
- **Datadog**: Full observability platform
- **CloudWatch**: If using AWS
- **Sentry**: Error tracking

Example Sentry integration:

```typescript
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});

// Add to Express app
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

### Health Checks

Set up automated health checks:

- **UptimeRobot**: Free uptime monitoring
- **Pingdom**: Advanced monitoring
- **StatusCake**: Comprehensive monitoring

Monitor the `/health` endpoint every 5 minutes.

### Performance Monitoring

Consider adding:

- Response time tracking
- Database query performance
- Job queue metrics
- API endpoint usage statistics

## Scaling Considerations

### Horizontal Scaling

The server is stateless and can be scaled horizontally:

1. Deploy multiple instances behind a load balancer
2. Use sticky sessions if needed (though not required)
3. Ensure all instances connect to the same Supabase instance

### Database Connection Pooling

Supabase handles connection pooling, but monitor:

- Connection count
- Query performance
- Database CPU/memory usage

### Rate Limiting

Consider adding rate limiting for public endpoints:

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## Security Hardening

### 1. HTTPS Only

Ensure all traffic uses HTTPS in production. Use Let's Encrypt for free SSL certificates.

### 2. Environment Variables

Never commit `.env` files. Use:
- Environment variables in hosting platform
- Secrets management (AWS Secrets Manager, HashiCorp Vault)

### 3. Helmet Configuration

Already included, but verify headers:

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));
```

### 4. Input Validation

Consider adding validation library like `joi` or `zod` for request validation.

### 5. Dependency Auditing

Regularly run:

```bash
npm audit
npm audit fix
```

## Backup Strategy

### Database Backups

Supabase provides automatic backups, but also:

1. Enable point-in-time recovery
2. Test restore procedures regularly
3. Keep backups in multiple regions

### Code Backups

- Use Git with remote repository (GitHub, GitLab)
- Tag releases: `git tag v1.0.0`
- Maintain production branch separate from development

## Rollback Plan

If deployment fails:

1. Revert to previous Docker image/deployment
2. Check logs for errors
3. Verify environment variables
4. Test in staging environment first

## CI/CD Pipeline

Example GitHub Actions workflow:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - name: Deploy
        run: |
          # Your deployment commands here
```

## Support

For issues or questions:
- Check logs first
- Review this documentation
- Contact DevOps team

