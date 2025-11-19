# AI Chatbot Implementation Guide

Complete guide for implementing the AI-powered analytics chatbot that allows users to query their data using natural language.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Security Requirements](#security-requirements)
- [Implementation Steps](#implementation-steps)
- [SQL Generation](#sql-generation)
- [Query Validation](#query-validation)
- [Performance Optimization](#performance-optimization)
- [Cost Management](#cost-management)
- [Testing](#testing)

---

## Overview

### What It Does

The AI chatbot allows users to ask questions about their data in natural language:

**User:** "How many webinars did we run last month?"  
**AI:** "You ran 42 webinars last month. Attendance rate was 68%, up 5% from the previous month."

**User:** "Which project has the best conversion rate?"  
**AI:** "Q1 Product Launch has the best conversion rate at 24.5%, with 156 registrants and 38 attendees."

### How It Works

```
User Question
  ↓
1. Load Context (workspace schema, projects)
  ↓
2. Generate SQL Query (using LLM)
  ↓
3. Validate Query (security checks)
  ↓
4. Execute Query (read-only, with limits)
  ↓
5. Format Results (natural language + charts)
  ↓
Response to User
```

---

## Architecture

### Service Structure

```
ai-chatbot-service/
├── src/
│   ├── api/
│   │   ├── routes.ts              # API endpoints
│   │   └── middleware.ts          # Auth, rate limiting
│   ├── query-engine/
│   │   ├── sql-generator.ts       # LLM-based SQL generation
│   │   ├── sql-validator.ts       # Security validation
│   │   ├── query-executor.ts      # Execute with safety limits
│   │   └── result-formatter.ts    # Format for display
│   ├── context/
│   │   ├── workspace-context.ts   # Load workspace data
│   │   ├── project-context.ts     # Load project data
│   │   ├── schema-context.ts      # Load database schema
│   │   └── conversation-context.ts # Chat history
│   ├── security/
│   │   ├── workspace-isolation.ts # Enforce workspace_id
│   │   ├── query-limits.ts        # Timeouts, row limits
│   │   └── sensitive-data.ts      # Block credentials access
│   ├── cache/
│   │   ├── query-cache.ts         # Cache query results
│   │   └── metrics-cache.ts       # Cache common metrics
│   ├── llm/
│   │   ├── openai-client.ts       # OpenAI API client
│   │   ├── prompt-templates.ts    # System prompts
│   │   └── function-tools.ts      # Function calling definitions
│   └── index.ts                   # Entry point
├── package.json
├── tsconfig.json
└── .env.example
```

### API Endpoints

```typescript
// POST /api/chat/ask
// Ask a question
{
  "workspace_id": "uuid",
  "project_id": "uuid", // optional
  "question": "How many webinars last month?",
  "conversation_id": "uuid" // optional, for context
}

// GET /api/chat/conversations
// List conversations for user

// GET /api/chat/conversations/:id
// Get conversation history

// DELETE /api/chat/conversations/:id
// Delete conversation
```

---

## Security Requirements

### 1. Read-Only Database User

**Critical:** Create a dedicated read-only database user for the AI chatbot.

```sql
-- Create read-only user
CREATE USER ai_chatbot WITH PASSWORD 'secure_random_password';

-- Grant SELECT only on public schema
GRANT USAGE ON SCHEMA public TO ai_chatbot;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ai_chatbot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ai_chatbot;

-- Revoke access to sensitive tables
REVOKE SELECT ON integration_accounts FROM ai_chatbot;
REVOKE SELECT ON workspace_members FROM ai_chatbot;

-- Ensure no write permissions
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM ai_chatbot;
```

### 2. Workspace Isolation

**Every query MUST filter by workspace_id:**

```typescript
function enforceWorkspaceIsolation(sql: string, workspaceId: string): boolean {
  const ast = parseSQLQuery(sql);
  
  // Check if WHERE clause exists
  if (!ast.where) {
    return false;
  }
  
  // Check if workspace_id filter exists
  const hasWorkspaceFilter = ast.where.conditions.some(
    condition => condition.column === 'workspace_id' && condition.value === workspaceId
  );
  
  return hasWorkspaceFilter;
}
```

### 3. Query Validation Rules

```typescript
const VALIDATION_RULES = {
  // Only SELECT statements
  allowedStatements: ['SELECT'],
  
  // Blocked tables (sensitive data)
  blockedTables: [
    'integration_accounts',
    'workspace_members',
    'users' // Unless specific columns
  ],
  
  // Blocked operations
  blockedOperations: [
    'DROP', 'DELETE', 'UPDATE', 'INSERT',
    'ALTER', 'CREATE', 'TRUNCATE'
  ],
  
  // Maximum limits
  maxLimit: 1000,
  maxTimeout: 5000, // 5 seconds
  
  // Required filters
  requiredFilters: ['workspace_id']
};
```

### 4. Database Views for Safety

Create safe views that automatically filter by workspace:

```sql
-- Safe view for webinars
CREATE VIEW ai_webinars AS
SELECT 
  id, workspace_id, project_id, topic, start_time, 
  duration, status, host_email
FROM zoom_webinars
WHERE workspace_id = current_setting('app.current_workspace_id', true)::uuid;

-- Safe view for attendees
CREATE VIEW ai_attendees AS
SELECT 
  id, workspace_id, meeting_id, webinar_id, 
  name, email, join_time, leave_time, duration
FROM zoom_attendees
WHERE workspace_id = current_setting('app.current_workspace_id', true)::uuid;

-- Grant access to views
GRANT SELECT ON ai_webinars TO ai_chatbot;
GRANT SELECT ON ai_attendees TO ai_chatbot;
```

---

## Implementation Steps

### Phase 1: Foundation (Week 1-2)

**1. Set up AI Chatbot Service**

```bash
mkdir ai-chatbot-service
cd ai-chatbot-service
npm init -y
npm install express @supabase/supabase-js openai pgsql-ast-parser dotenv
npm install -D typescript @types/express @types/node ts-node-dev
```

**2. Create Database User**

```sql
-- Run the read-only user creation script from Security Requirements
```

**3. Add Required Tables**

```sql
-- Chat conversations
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID REFERENCES projects(id),
  title TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_conversations_workspace ON chat_conversations(workspace_id, created_at DESC);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at ASC);
```

### Phase 2: SQL Generation (Week 3-4)

**1. Implement SQL Generator**

```typescript
// src/query-engine/sql-generator.ts
import OpenAI from 'openai';

export class SQLGenerator {
  private openai: OpenAI;
  
  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }
  
  async generateSQL(
    question: string,
    workspaceContext: WorkspaceContext,
    conversationHistory?: Message[]
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(workspaceContext);
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory || [],
      { role: 'user', content: question }
    ];
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages,
      tools: [
        {
          type: 'function',
          function: {
            name: 'query_database',
            description: 'Execute a SQL query to answer the user\'s question',
            parameters: {
              type: 'object',
              properties: {
                sql: {
                  type: 'string',
                  description: 'The SQL query to execute'
                },
                explanation: {
                  type: 'string',
                  description: 'Explanation of what the query does'
                }
              },
              required: ['sql', 'explanation']
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'query_database' } }
    });
    
    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No SQL generated');
    }
    
    const args = JSON.parse(toolCall.function.arguments);
    return args.sql;
  }
  
  private buildSystemPrompt(context: WorkspaceContext): string {
    return `You are a SQL expert helping users query their webinar management database.

CRITICAL RULES:
1. ALWAYS include WHERE workspace_id = '${context.workspace_id}' in every query
2. ONLY use SELECT statements (no INSERT, UPDATE, DELETE, DROP)
3. NEVER query these tables: integration_accounts, workspace_members
4. Always add LIMIT 1000 if not specified
5. Use proper JOINs when querying related tables

Available tables and columns:
${this.formatSchemaInfo(context.schema)}

Projects in this workspace:
${context.projects.map(p => `- ${p.name} (id: ${p.id})`).join('\n')}

Generate SQL queries that:
- Are PostgreSQL compatible
- Use proper table aliases
- Include appropriate JOINs
- Filter by workspace_id
- Are optimized for performance`;
  }
  
  private formatSchemaInfo(schema: SchemaInfo): string {
    // Format schema information for the prompt
    return Object.entries(schema.tables).map(([table, columns]) => {
      return `${table}:\n${columns.map(c => `  - ${c.name} (${c.type})`).join('\n')}`;
    }).join('\n\n');
  }
}
```

**2. Load Workspace Context**

```typescript
// src/context/workspace-context.ts
export class WorkspaceContextLoader {
  async load(workspaceId: string): Promise<WorkspaceContext> {
    // Load workspace info
    const workspace = await this.loadWorkspace(workspaceId);
    
    // Load projects
    const projects = await this.loadProjects(workspaceId);
    
    // Load schema info
    const schema = await this.loadSchema();
    
    // Load recent metrics for context
    const recentMetrics = await this.loadRecentMetrics(workspaceId);
    
    return {
      workspace_id: workspaceId,
      workspace,
      projects,
      schema,
      recentMetrics
    };
  }
  
  private async loadSchema(): Promise<SchemaInfo> {
    // Query information_schema to get table/column info
    const { data } = await supabase
      .from('information_schema.columns')
      .select('table_name, column_name, data_type')
      .in('table_name', [
        'zoom_webinars', 'zoom_meetings', 'zoom_attendees',
        'zoom_registrants', 'contacts', 'projects'
      ]);
    
    // Format into schema structure
    return this.formatSchema(data);
  }
}
```

### Phase 3: Query Validation (Week 5)

**1. Implement SQL Validator**

```typescript
// src/query-engine/sql-validator.ts
import { parse } from 'pgsql-ast-parser';

export class SQLValidator {
  validate(sql: string, workspaceId: string): ValidationResult {
    try {
      // Parse SQL to AST
      const ast = parse(sql);
      
      // Check 1: Only SELECT statements
      if (ast[0].type !== 'select') {
        return {
          valid: false,
          reason: 'Only SELECT queries are allowed'
        };
      }
      
      // Check 2: No sensitive tables
      const tables = this.extractTables(ast[0]);
      const blockedTables = ['integration_accounts', 'workspace_members'];
      const hasSensitiveTables = tables.some(t => blockedTables.includes(t));
      
      if (hasSensitiveTables) {
        return {
          valid: false,
          reason: 'Cannot query sensitive tables'
        };
      }
      
      // Check 3: Has workspace_id filter
      if (!this.hasWorkspaceFilter(ast[0], workspaceId)) {
        return {
          valid: false,
          reason: 'Query must filter by workspace_id'
        };
      }
      
      // Check 4: Add LIMIT if missing
      let validatedSQL = sql;
      if (!ast[0].limit) {
        validatedSQL += ' LIMIT 1000';
      }
      
      return {
        valid: true,
        sql: validatedSQL
      };
      
    } catch (error) {
      return {
        valid: false,
        reason: `SQL parsing error: ${error.message}`
      };
    }
  }
  
  private extractTables(ast: any): string[] {
    const tables: string[] = [];
    
    // Extract from FROM clause
    if (ast.from) {
      ast.from.forEach((from: any) => {
        if (from.type === 'table') {
          tables.push(from.name);
        }
      });
    }
    
    // Extract from JOINs
    if (ast.joins) {
      ast.joins.forEach((join: any) => {
        if (join.table?.name) {
          tables.push(join.table.name);
        }
      });
    }
    
    return tables;
  }
  
  private hasWorkspaceFilter(ast: any, workspaceId: string): boolean {
    if (!ast.where) return false;
    
    // Recursively check WHERE conditions
    return this.checkCondition(ast.where, workspaceId);
  }
  
  private checkCondition(condition: any, workspaceId: string): boolean {
    if (condition.type === 'binary') {
      // Check if this is workspace_id = 'xxx'
      if (
        condition.left?.name === 'workspace_id' &&
        condition.operator === '=' &&
        condition.right?.value === workspaceId
      ) {
        return true;
      }
      
      // Check nested conditions (AND, OR)
      if (condition.operator === 'AND' || condition.operator === 'OR') {
        return this.checkCondition(condition.left, workspaceId) ||
               this.checkCondition(condition.right, workspaceId);
      }
    }
    
    return false;
  }
}
```

**2. Implement Query Executor**

```typescript
// src/query-engine/query-executor.ts
import { Pool } from 'pg';

export class QueryExecutor {
  private pool: Pool;
  
  constructor() {
    // Use read-only database user
    this.pool = new Pool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME,
      user: 'ai_chatbot', // Read-only user
      password: process.env.AI_DB_PASSWORD,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  
  async execute(
    sql: string,
    workspaceId: string
  ): Promise<QueryResult> {
    const startTime = Date.now();
    
    try {
      // Set workspace context
      await this.pool.query(
        `SET app.current_workspace_id = '${workspaceId}'`
      );
      
      // Execute with timeout
      const result = await Promise.race([
        this.pool.query(sql),
        this.timeout(5000)
      ]);
      
      const executionTime = Date.now() - startTime;
      
      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        executionTime
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }
  
  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout')), ms);
    });
  }
}
```

### Phase 4: Result Formatting (Week 6)

**1. Format Results for Display**

```typescript
// src/query-engine/result-formatter.ts
export class ResultFormatter {
  async format(
    question: string,
    queryResult: QueryResult,
    sql: string
  ): Promise<FormattedResponse> {
    // Generate natural language response
    const response = await this.generateResponse(question, queryResult);
    
    // Detect if data should be visualized
    const chartType = this.detectChartType(queryResult);
    
    return {
      answer: response,
      data: queryResult.rows,
      chart: chartType ? {
        type: chartType,
        data: this.formatForChart(queryResult.rows, chartType)
      } : undefined,
      metadata: {
        sql,
        executionTime: queryResult.executionTime,
        rowCount: queryResult.rowCount
      }
    };
  }
  
  private async generateResponse(
    question: string,
    result: QueryResult
  ): Promise<string> {
    // Use LLM to generate natural language response
    const prompt = `
Question: ${question}

Query Results:
${JSON.stringify(result.rows, null, 2)}

Generate a concise, natural language answer to the question based on these results.
Include key insights and trends if applicable.
    `;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500
    });
    
    return response.choices[0].message.content;
  }
  
  private detectChartType(result: QueryResult): ChartType | null {
    if (result.rowCount === 0) return null;
    
    const columns = Object.keys(result.rows[0]);
    
    // Time series data (has date/timestamp column)
    if (columns.some(c => c.includes('date') || c.includes('time'))) {
      return 'line';
    }
    
    // Categorical data with counts
    if (columns.length === 2 && result.rowCount > 1) {
      return 'bar';
    }
    
    // Single metric
    if (columns.length === 1 && result.rowCount === 1) {
      return 'metric';
    }
    
    return 'table';
  }
}
```

### Phase 5: Caching & Optimization (Week 7-8)

**1. Implement Query Caching**

```typescript
// src/cache/query-cache.ts
import Redis from 'ioredis';

export class QueryCache {
  private redis: Redis;
  
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL);
  }
  
  async get(key: string): Promise<any | null> {
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  async set(key: string, value: any, ttlSeconds: number = 300): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }
  
  generateKey(question: string, workspaceId: string): string {
    const hash = crypto
      .createHash('md5')
      .update(`${workspaceId}:${question}`)
      .digest('hex');
    return `query:${hash}`;
  }
}
```

**2. Pre-Compute Common Metrics**

```typescript
// src/cache/metrics-cache.ts
export class MetricsCache {
  private commonQueries = {
    total_webinars: `
      SELECT COUNT(*) as count 
      FROM zoom_webinars 
      WHERE workspace_id = $1
    `,
    avg_attendance: `
      SELECT AVG(attendance_rate) as rate 
      FROM project_metrics 
      WHERE workspace_id = $1
    `,
    // ... more common queries
  };
  
  async getCommonMetric(
    metric: string,
    workspaceId: string
  ): Promise<any> {
    const cacheKey = `metric:${workspaceId}:${metric}`;
    
    // Check cache
    let result = await this.cache.get(cacheKey);
    
    if (!result) {
      // Execute query
      const sql = this.commonQueries[metric];
      result = await this.executor.execute(sql, workspaceId);
      
      // Cache for 1 hour
      await this.cache.set(cacheKey, result, 3600);
    }
    
    return result;
  }
}
```

---

## Performance Optimization

### 1. Hybrid Query Strategy

```typescript
export class HybridQueryEngine {
  async answer(question: string, workspaceId: string): Promise<Response> {
    // Tier 1: Check if it's a common question
    const commonMetric = this.detectCommonQuestion(question);
    if (commonMetric) {
      return await this.metricsCache.getCommonMetric(commonMetric, workspaceId);
    }
    
    // Tier 2: Check query cache
    const cacheKey = this.queryCache.generateKey(question, workspaceId);
    const cached = await this.queryCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Tier 3: Generate and execute SQL
    const sql = await this.sqlGenerator.generateSQL(question, context);
    const validation = this.sqlValidator.validate(sql, workspaceId);
    
    if (!validation.valid) {
      throw new Error(validation.reason);
    }
    
    const result = await this.queryExecutor.execute(validation.sql, workspaceId);
    const formatted = await this.resultFormatter.format(question, result, sql);
    
    // Cache result
    await this.queryCache.set(cacheKey, formatted, 300); // 5 minutes
    
    return formatted;
  }
}
```

### 2. Database Optimization

```sql
-- Add indexes for common queries
CREATE INDEX idx_zoom_webinars_workspace_start ON zoom_webinars(workspace_id, start_time DESC);
CREATE INDEX idx_zoom_attendees_workspace_join ON zoom_attendees(workspace_id, join_time DESC);
CREATE INDEX idx_project_metrics_workspace_date ON project_metrics(workspace_id, date DESC);

-- Create materialized view for common aggregations
CREATE MATERIALIZED VIEW workspace_summary AS
SELECT 
  workspace_id,
  COUNT(DISTINCT id) as total_webinars,
  AVG(attendance_rate) as avg_attendance,
  SUM(total_registrants) as total_registrants
FROM project_metrics
GROUP BY workspace_id;

-- Refresh nightly
CREATE INDEX ON workspace_summary(workspace_id);
```

---

## Cost Management

### LLM API Cost Optimization

**1. Use Cheaper Models for Simple Questions**

```typescript
function selectModel(question: string): string {
  // Simple questions → cheaper model
  if (question.split(' ').length < 10) {
    return 'gpt-3.5-turbo'; // ~$0.001 per request
  }
  
  // Complex questions → better model
  return 'gpt-4-turbo-preview'; // ~$0.01 per request
}
```

**2. Implement Rate Limiting**

```typescript
// Limit: 100 questions per user per day
const rateLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 100,
  keyGenerator: (req) => req.user.id
});

app.use('/api/chat', rateLimit);
```

**3. Cache Aggressively**

```typescript
// Cache common queries for 1 hour
// Cache specific queries for 5 minutes
// Cache conversation context for session duration
```

**Estimated Costs:**
- 100 questions/day per user = $2-5/day = $60-150/month
- With caching: ~50% reduction = $30-75/month per active user
- With pre-computed metrics: ~70% reduction = $18-45/month per active user

---

## Testing

### 1. Unit Tests

```typescript
// test/sql-validator.test.ts
describe('SQLValidator', () => {
  it('should reject non-SELECT queries', () => {
    const result = validator.validate('DELETE FROM users', workspaceId);
    expect(result.valid).toBe(false);
  });
  
  it('should reject queries without workspace_id', () => {
    const result = validator.validate('SELECT * FROM zoom_webinars', workspaceId);
    expect(result.valid).toBe(false);
  });
  
  it('should accept valid queries', () => {
    const sql = 'SELECT * FROM zoom_webinars WHERE workspace_id = \'xxx\'';
    const result = validator.validate(sql, 'xxx');
    expect(result.valid).toBe(true);
  });
});
```

### 2. Integration Tests

```typescript
// test/integration/chatbot.test.ts
describe('AI Chatbot Integration', () => {
  it('should answer simple counting questions', async () => {
    const response = await chatbot.ask(
      'How many webinars?',
      testWorkspaceId
    );
    
    expect(response.answer).toContain('webinar');
    expect(response.metadata.sql).toContain('COUNT');
  });
  
  it('should enforce workspace isolation', async () => {
    // Try to access another workspace's data
    const response = await chatbot.ask(
      'Show me all webinars',
      workspace1Id
    );
    
    // Should only return workspace1's data
    const workspaceIds = response.data.map(r => r.workspace_id);
    expect(workspaceIds.every(id => id === workspace1Id)).toBe(true);
  });
});
```

### 3. Security Tests

```typescript
// test/security/sql-injection.test.ts
describe('SQL Injection Protection', () => {
  it('should block SQL injection attempts', async () => {
    const maliciousQuestions = [
      "Show me webinars; DROP TABLE users; --",
      "'; DELETE FROM integration_accounts; --",
      "1' OR '1'='1"
    ];
    
    for (const question of maliciousQuestions) {
      await expect(
        chatbot.ask(question, workspaceId)
      ).rejects.toThrow();
    }
  });
});
```

---

## Deployment Checklist

- [ ] Create read-only database user
- [ ] Add chat tables to database
- [ ] Create database views for safety
- [ ] Set up Redis for caching
- [ ] Configure OpenAI API key
- [ ] Set up rate limiting
- [ ] Add monitoring and logging
- [ ] Test security validation
- [ ] Test workspace isolation
- [ ] Load test with concurrent users
- [ ] Set up cost alerts for LLM API
- [ ] Document for frontend team

---

## Related Documentation

- [System Architecture](ARCHITECTURE.md) - Overall system design
- [Database Schema](DATABASE_SCHEMA.md) - Complete schema reference
- [Security Best Practices](../server/SECURITY.md) - Security guidelines

---

**Status:** Implementation Guide  
**Last Updated:** 2024-11-19

