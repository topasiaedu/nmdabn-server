import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { ghlWebhookHandler } from './routes/ghl-webhook';

// Import routes
import googleAuthRoutes from './routes/google-auth';
import integrationsRoutes from './routes/integrations';
import jobsRoutes from './routes/jobs';
import actionsRoutes from './routes/actions';
import webhooksRoutes from './routes/webhooks';
import projectsRoutes from './routes/projects';
import workspacesRoutes from './routes/workspaces';
import dashboardTrafficRoutes from './routes/dashboard-traffic';

const app = express();

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS configuration (add FRONTEND_ORIGIN for Traffic dashboard dev server, e.g. http://localhost:5173)
const productionCorsOrigins = [
  'https://your-frontend-domain.com',
  ...(env.frontendOrigin ? [env.frontendOrigin] : []),
].filter((o) => o.length > 0);

app.use(
  cors({
    origin:
      env.server.nodeEnv === 'production' ? productionCorsOrigins : true,
    credentials: true,
  })
);

// GHL marketplace webhooks: signature is computed over the raw body; parse only this route as raw JSON.
app.post(
  '/api/webhooks/ghl',
  express.raw({ type: '*/*', limit: '10mb' }),
  ghlWebhookHandler
);

// Body parsing (must run after the raw GHL route above)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// Routes
// ============================================================================

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: env.server.nodeEnv,
  });
});

// API routes
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/workspaces', workspacesRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/dashboard', dashboardTrafficRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.path,
  });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: env.server.nodeEnv === 'development' ? err.message : undefined,
  });
});

// ============================================================================
// Server Startup
// ============================================================================

const PORT = env.server.port;

app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Main Backend Server Started');
  console.log('='.repeat(60));
  console.log(`Environment: ${env.server.nodeEnv}`);
  console.log(`Port: ${PORT}`);
  console.log(`Supabase URL: ${env.supabase.url}`);
  console.log('='.repeat(60));
  console.log('\nAvailable Routes:');
  console.log('  GET    /health');
  console.log('  GET    /api/auth/google/authorize');
  console.log('  GET    /api/auth/google/callback');
  console.log('  GET    /api/projects');
  console.log('  GET    /api/workspaces');
  console.log('  GET    /api/projects/:id');
  console.log('  POST   /api/projects');
  console.log('  PATCH  /api/projects/:id');
  console.log('  DELETE /api/projects/:id');
  console.log('  GET    /api/integrations/accounts');
  console.log('  GET    /api/integrations/accounts/:id');
  console.log('  POST   /api/integrations/accounts/zoom');
  console.log('  POST   /api/integrations/accounts/vapi');
  console.log('  PATCH  /api/integrations/accounts/:id');
  console.log('  DELETE /api/integrations/accounts/:id');
  console.log('  GET    /api/jobs');
  console.log('  GET    /api/jobs/:id');
  console.log('  POST   /api/actions/google-sheets/append-row');
  console.log('  POST   /api/actions/google-sheets/sync-sheet');
  console.log('  POST   /api/actions/vapi/create-call');
  console.log('  POST   /api/actions/vapi/sync-call-log');
  console.log('  POST   /api/actions/zoom/create-meeting');
  console.log('  POST   /api/actions/zoom/add-registrant');
  console.log('  POST   /api/actions/zoom/sync-meeting');
  console.log('  POST   /api/webhooks/zoom');
  console.log('  POST   /api/webhooks/vapi');
  console.log('  POST   /api/webhooks/google-sheets');
  console.log('  POST   /api/webhooks/test');
  if (env.ghl !== undefined) {
    console.log('  POST   /api/webhooks/ghl  (GoHighLevel — contact mirror sync)');
  }
  console.log('  GET    /api/dashboard/traffic');
  console.log('  GET    /api/dashboard/traffic/lines');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

export default app;

