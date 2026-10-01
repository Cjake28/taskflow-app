import {
  changeEmailSchema,
  changePasswordSchema,
  createTaskSchema,
  forgotPasswordSchema,
  loginSchema,
  moveTaskSchema,
  registerSchema,
  resendRegistrationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  updateTaskSchema,
  verifyEmailChangeSchema,
  verifyRegistrationSchema,
  verifyResetTokenSchema,
} from '@taskflow/shared';
import { z, type ZodType } from 'zod';

type Json = Record<string, unknown>;

/** Request bodies come straight from the shared Zod schemas, so the docs cannot drift. */
function bodySchema(schema: ZodType): Json {
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
  delete json.$schema;
  return stripDatePatterns(json) as Json;
}

/** Zod adds a very long regex next to `format: date-time`; the format alone is clearer. */
function stripDatePatterns(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDatePatterns);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Json).filter(
      ([key]) => !(key === 'pattern' && (value as Json).format === 'date-time'),
    );
    return Object.fromEntries(entries.map(([key, inner]) => [key, stripDatePatterns(inner)]));
  }
  return value;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json) => ({ 'application/json': { schema } });
const data = (schema: Json) => json({ type: 'object', properties: { data: schema } });
const list = (schema: Json) => ({ type: 'array', items: schema });

const errors = (...statuses: number[]) =>
  Object.fromEntries(
    statuses.map((status) => [status, { $ref: `#/components/responses/Error${status}` }]),
  );

const ok = (schema: Json, description = 'OK') => ({ description, content: data(schema) });
const noContent = { description: 'No content' };

const idParam = (name = 'id', description = 'Resource id') => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' },
});

const body = (schema: ZodType) => ({ required: true, content: json(bodySchema(schema)) });

const multipart = (field: string, maxItems: number) => ({
  required: true,
  content: {
    'multipart/form-data': {
      schema: {
        type: 'object',
        required: [field],
        properties: {
          [field]:
            maxItems === 1
              ? { type: 'string', format: 'binary' }
              : { type: 'array', maxItems, items: { type: 'string', format: 'binary' } },
        },
      },
    },
  },
});

const query = (name: string, schema: Json, description: string) => ({
  name,
  in: 'query',
  required: false,
  description,
  schema,
});

const STATUS = { type: 'string', enum: ['TODO', 'IN_PROGRESS', 'COMPLETED'] };
const PRIORITY = { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] };
const DATE_TIME = { type: 'string', format: 'date-time' };
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' };

const schemas: Record<string, Json> = {
  User: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      username: { type: 'string' },
      email: { type: 'string', format: 'email' },
      avatarUrl: { type: ['string', 'null'], example: '/api/v1/images/0199…' },
      hasPassword: { type: 'boolean' },
      emailVerified: { type: 'boolean' },
      createdAt: DATE_TIME,
    },
  },
  Session: {
    type: 'object',
    properties: { user: ref('User'), accessTokenExpiresAt: DATE_TIME },
  },
  PendingRegistration: {
    type: 'object',
    properties: {
      registrationId: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      expiresAt: DATE_TIME,
      resendAvailableAt: DATE_TIME,
    },
  },
  PendingEmailChange: {
    type: 'object',
    properties: {
      email: { type: 'string', format: 'email' },
      expiresAt: DATE_TIME,
      resendAvailableAt: DATE_TIME,
    },
  },
  DeviceSession: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      device: { type: 'string', example: 'Chrome on Windows' },
      ipAddress: { type: ['string', 'null'] },
      createdAt: DATE_TIME,
      lastUsedAt: DATE_TIME,
      current: { type: 'boolean' },
    },
  },
  LinkedAccounts: {
    type: 'object',
    properties: {
      hasPassword: { type: 'boolean' },
      providers: list({
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['google', 'github'] },
          email: { type: ['string', 'null'] },
          connectedAt: DATE_TIME,
        },
      }),
    },
  },
  Image: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      url: { type: 'string', example: '/api/v1/images/0199…' },
      thumbUrl: { type: 'string', example: '/api/v1/images/0199…?variant=thumb' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      sizeBytes: { type: 'integer' },
      originalName: { type: ['string', 'null'] },
      createdAt: DATE_TIME,
    },
  },
  Task: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      description: { type: ['string', 'null'] },
      status: STATUS,
      priority: PRIORITY,
      dueDate: NULLABLE_DATE_TIME,
      hasDueTime: { type: 'boolean' },
      completedAt: NULLABLE_DATE_TIME,
      position: { type: 'number' },
      isOverdue: { type: 'boolean' },
      imageCount: { type: 'integer' },
      coverThumbUrl: { type: ['string', 'null'] },
      createdAt: DATE_TIME,
      updatedAt: DATE_TIME,
    },
  },
  TaskDetails: {
    allOf: [ref('Task'), { type: 'object', properties: { images: list(ref('Image')) } }],
  },
  Activity: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      action: {
        type: 'string',
        enum: ['CREATED', 'UPDATED', 'STATUS_CHANGED', 'DELETED', 'IMAGE_ADDED', 'IMAGE_REMOVED'],
      },
      taskId: { type: ['string', 'null'], format: 'uuid' },
      taskTitle: { type: 'string' },
      changes: {
        type: ['object', 'null'],
        example: { status: { from: 'TODO', to: 'IN_PROGRESS' } },
      },
      createdAt: DATE_TIME,
    },
  },
  DashboardStats: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      byStatus: {
        type: 'object',
        properties: {
          TODO: { type: 'integer' },
          IN_PROGRESS: { type: 'integer' },
          COMPLETED: { type: 'integer' },
        },
      },
      byPriority: {
        type: 'object',
        properties: {
          LOW: { type: 'integer' },
          MEDIUM: { type: 'integer' },
          HIGH: { type: 'integer' },
        },
      },
      overdue: { type: 'integer' },
      dueSoon: { type: 'integer', description: 'Open tasks due in the next 7 days' },
      completedLast7Days: { type: 'integer' },
      completionRate: { type: 'integer', description: 'Percentage 0–100' },
    },
  },
  PaginationMeta: {
    type: 'object',
    properties: {
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
      totalPages: { type: 'integer' },
    },
  },
  Error: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message', 'requestId'],
        properties: {
          code: { type: 'string', example: 'VALIDATION_ERROR' },
          message: { type: 'string' },
          details: list({
            type: 'object',
            properties: { field: { type: 'string' }, message: { type: 'string' } },
          }),
          requestId: { type: 'string' },
        },
      },
    },
  },
};

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'Validation or business-rule error (see `error.code` and `error.details`)',
  401: 'Not signed in, or the access token expired (`TOKEN_EXPIRED` → call /auth/refresh)',
  403: 'Request origin not allowed (CSRF protection)',
  404: 'Not found — also returned for resources owned by another user',
  409: 'Username or email already in use',
  413: 'File too large or storage quota exceeded',
  415: 'Expected multipart/form-data',
  429: 'Rate limited (see the Retry-After header)',
};

const responses = Object.fromEntries(
  Object.entries(ERROR_DESCRIPTIONS).map(([status, description]) => [
    `Error${status}`,
    { description, content: json(ref('Error')) },
  ]),
);

const TASK_LIST_PARAMS = [
  query('search', { type: 'string' }, 'Case-insensitive title search'),
  query('status', { type: 'string', example: 'TODO,IN_PROGRESS' }, 'Comma-separated statuses'),
  query('priority', { type: 'string', example: 'HIGH' }, 'Comma-separated priorities'),
  query('overdue', { type: 'string', enum: ['true', 'false'] }, 'Only overdue open tasks'),
  query('dueFrom', DATE_TIME, 'Due on or after (ISO datetime)'),
  query('dueTo', DATE_TIME, 'Due on or before (ISO datetime)'),
  query(
    'sortBy',
    {
      type: 'string',
      enum: ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title', 'position'],
      default: 'createdAt',
    },
    'Sort field (dueDate puts undated tasks last)',
  ),
  query('sortOrder', { type: 'string', enum: ['asc', 'desc'], default: 'desc' }, 'Sort order'),
  query('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
  query('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 10 }, 'Page size'),
];

const paths: Record<string, Json> = {
  '/health': {
    get: {
      tags: ['System'],
      summary: 'Health of the database, Redis and storage',
      security: [],
      responses: { 200: ok({ type: 'object' }), 503: { description: 'Degraded' } },
    },
  },
  '/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Start a sign-up: validates the details and emails a 6-digit code (no account yet)',
      security: [],
      requestBody: body(registerSchema),
      responses: { 202: ok(ref('PendingRegistration'), 'Code sent'), ...errors(400, 409, 429) },
    },
  },
  '/auth/register/verify': {
    post: {
      tags: ['Auth'],
      summary: 'Confirm the emailed code: creates the account and signs in',
      description:
        'Codes expire after 10 minutes; 5 wrong codes cancel the sign-up (`OTP_ATTEMPTS_EXCEEDED`).',
      security: [],
      requestBody: body(verifyRegistrationSchema),
      responses: {
        201: ok(ref('Session'), 'Created; auth cookies set'),
        ...errors(400, 409, 429),
      },
    },
  },
  '/auth/register/resend': {
    post: {
      tags: ['Auth'],
      summary: 'Email a new code (60-second cooldown; the previous code stops working)',
      security: [],
      requestBody: body(resendRegistrationSchema),
      responses: { 200: ok(ref('PendingRegistration')), ...errors(400, 429) },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Sign in with email or username',
      security: [],
      requestBody: body(loginSchema),
      responses: { 200: ok(ref('Session'), 'Auth cookies set'), ...errors(400, 401, 429) },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Rotate the refresh cookie and issue a new access token',
      security: [],
      responses: { 200: ok(ref('Session')), ...errors(401, 429) },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Revoke this session',
      security: [],
      responses: { 204: noContent },
    },
  },
  '/auth/logout-all': {
    post: {
      tags: ['Auth'],
      summary: 'Revoke every session of the user',
      responses: { 204: noContent, ...errors(401) },
    },
  },
  '/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Email a reset link (same response whether or not the account exists)',
      security: [],
      requestBody: body(forgotPasswordSchema),
      responses: { 202: ok({ type: 'object' }, 'Accepted'), ...errors(400, 429) },
    },
  },
  '/auth/reset-password/verify': {
    post: {
      tags: ['Auth'],
      summary: 'Check that a reset token is valid',
      security: [],
      requestBody: body(verifyResetTokenSchema),
      responses: { 204: noContent, ...errors(400, 429) },
    },
  },
  '/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Set a new password with a reset token (signs out every session)',
      security: [],
      requestBody: body(resetPasswordSchema),
      responses: { 204: noContent, ...errors(400, 429) },
    },
  },
  '/auth/oauth/providers': {
    get: {
      tags: ['OAuth'],
      summary: 'Enabled OAuth providers',
      security: [],
      responses: { 200: ok(list({ type: 'string', enum: ['google', 'github'] })) },
    },
  },
  '/auth/oauth/{provider}': {
    get: {
      tags: ['OAuth'],
      summary: 'Start sign-in (or linking with mode=link) — browser navigation',
      security: [],
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['google', 'github'] },
        },
        query(
          'mode',
          { type: 'string', enum: ['login', 'link'] },
          'link = connect to the signed-in user',
        ),
      ],
      responses: { 302: { description: 'Redirect to the provider' } },
    },
  },
  '/auth/oauth/{provider}/callback': {
    get: {
      tags: ['OAuth'],
      summary: 'Provider callback — redirects back to the web app',
      security: [],
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['google', 'github'] },
        },
      ],
      responses: { 302: { description: 'Redirect to /dashboard, /profile or /login?oauthError=' } },
    },
  },
  '/users/me': {
    get: {
      tags: ['Account'],
      summary: 'Current user',
      responses: { 200: ok(ref('User')), ...errors(401) },
    },
    patch: {
      tags: ['Account'],
      summary: 'Update names and username (the email has its own confirmed flow)',
      requestBody: body(updateProfileSchema),
      responses: { 200: ok(ref('User')), ...errors(400, 401, 409) },
    },
  },
  '/users/me/email': {
    get: {
      tags: ['Account'],
      summary: 'The email change waiting for its code, or null',
      responses: {
        200: ok({ anyOf: [ref('PendingEmailChange'), { type: 'null' }] }),
        ...errors(401),
      },
    },
    post: {
      tags: ['Account'],
      summary:
        'Start an email change: emails a 6-digit code to the NEW address (nothing changes yet)',
      requestBody: body(changeEmailSchema),
      responses: { 202: ok(ref('PendingEmailChange'), 'Code sent'), ...errors(400, 401, 409, 429) },
    },
    delete: {
      tags: ['Account'],
      summary: 'Cancel a pending email change',
      responses: { 204: noContent, ...errors(401) },
    },
  },
  '/users/me/email/verify': {
    post: {
      tags: ['Account'],
      summary: 'Confirm the code: switches the email (verified) and notifies the old address',
      requestBody: body(verifyEmailChangeSchema),
      responses: { 200: ok(ref('User')), ...errors(400, 401, 409, 429) },
    },
  },
  '/users/me/email/resend': {
    post: {
      tags: ['Account'],
      summary: 'Send a new code (60-second cooldown)',
      responses: { 200: ok(ref('PendingEmailChange')), ...errors(400, 401, 429) },
    },
  },
  '/users/me/password': {
    patch: {
      tags: ['Account'],
      summary: 'Change (or set) the password; other sessions are signed out',
      requestBody: body(changePasswordSchema),
      responses: { 204: noContent, ...errors(400, 401) },
    },
  },
  '/users/me/avatar': {
    put: {
      tags: ['Account'],
      summary: 'Upload or replace the profile picture (stored as a 256 px WebP)',
      requestBody: multipart('image', 1),
      responses: { 200: ok(ref('User')), ...errors(400, 401, 413, 415) },
    },
    delete: {
      tags: ['Account'],
      summary: 'Remove the profile picture',
      responses: { 204: noContent, ...errors(401) },
    },
  },
  '/users/me/sessions': {
    get: {
      tags: ['Account'],
      summary: 'Active sessions (devices)',
      responses: { 200: ok(list(ref('DeviceSession'))), ...errors(401) },
    },
  },
  '/users/me/sessions/{id}': {
    delete: {
      tags: ['Account'],
      summary: 'Revoke a session',
      parameters: [idParam()],
      responses: { 204: noContent, ...errors(401, 404) },
    },
  },
  '/users/me/accounts': {
    get: {
      tags: ['OAuth'],
      summary: 'Connected Google/GitHub accounts',
      responses: { 200: ok(ref('LinkedAccounts')), ...errors(401) },
    },
  },
  '/users/me/accounts/{provider}': {
    delete: {
      tags: ['OAuth'],
      summary: 'Disconnect a provider (not the last way to sign in)',
      parameters: [
        {
          name: 'provider',
          in: 'path',
          required: true,
          schema: { type: 'string', enum: ['google', 'github'] },
        },
      ],
      responses: { 204: noContent, ...errors(400, 401, 404) },
    },
  },
  '/tasks': {
    get: {
      tags: ['Tasks'],
      summary: 'List, search, filter, sort and paginate your tasks',
      parameters: TASK_LIST_PARAMS,
      responses: {
        200: {
          description: 'OK',
          content: json({
            type: 'object',
            properties: { data: list(ref('Task')), meta: ref('PaginationMeta') },
          }),
        },
        ...errors(400, 401),
      },
    },
    post: {
      tags: ['Tasks'],
      summary: 'Create a task (placed at the top of its column)',
      requestBody: body(createTaskSchema),
      responses: { 201: ok(ref('TaskDetails'), 'Created'), ...errors(400, 401) },
    },
  },
  '/tasks/{id}': {
    get: {
      tags: ['Tasks'],
      summary: 'Task with its images',
      parameters: [idParam()],
      responses: { 200: ok(ref('TaskDetails')), ...errors(400, 401, 404) },
    },
    patch: {
      tags: ['Tasks'],
      summary: 'Update any subset of fields (null clears description or due date)',
      parameters: [idParam()],
      requestBody: body(updateTaskSchema),
      responses: { 200: ok(ref('TaskDetails')), ...errors(400, 401, 404) },
    },
    delete: {
      tags: ['Tasks'],
      summary: 'Delete a task (its images are kept for the retention period, then purged)',
      parameters: [idParam()],
      responses: { 204: noContent, ...errors(401, 404) },
    },
  },
  '/tasks/{id}/move': {
    patch: {
      tags: ['Tasks'],
      summary: 'Board drag and drop: new status and neighbours',
      parameters: [idParam()],
      requestBody: body(moveTaskSchema),
      responses: { 200: ok(ref('TaskDetails')), ...errors(400, 401, 404) },
    },
  },
  '/tasks/{id}/activities': {
    get: {
      tags: ['Tasks'],
      summary: 'Activity history of a task (newest first)',
      parameters: [idParam()],
      responses: { 200: ok(list(ref('Activity'))), ...errors(401, 404) },
    },
  },
  '/tasks/{id}/images': {
    post: {
      tags: ['Images'],
      summary: 'Upload 1–5 images (JPEG, PNG, WebP, GIF, AVIF; stored as WebP)',
      parameters: [idParam()],
      requestBody: multipart('images', 5),
      responses: {
        201: ok(list(ref('Image')), 'Created'),
        ...errors(400, 401, 404, 413, 415, 429),
      },
    },
  },
  '/tasks/{id}/images/{imageId}': {
    delete: {
      tags: ['Images'],
      summary: 'Remove an image (restorable during the retention period)',
      parameters: [idParam(), idParam('imageId', 'Image id')],
      responses: { 204: noContent, ...errors(401, 404) },
    },
  },
  '/tasks/{id}/images/{imageId}/restore': {
    post: {
      tags: ['Images'],
      summary: 'Undo an image removal',
      parameters: [idParam(), idParam('imageId', 'Image id')],
      responses: { 200: ok(ref('Image')), ...errors(400, 401, 404) },
    },
  },
  '/images/{id}': {
    get: {
      tags: ['Images'],
      summary: 'Image bytes (owner only; ETag revalidation)',
      parameters: [
        idParam(),
        query(
          'variant',
          { type: 'string', enum: ['display', 'thumb'], default: 'display' },
          'Size',
        ),
      ],
      responses: {
        200: {
          description: 'WebP image',
          content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
        },
        304: { description: 'Not modified' },
        ...errors(401, 404),
      },
    },
  },
  '/dashboard/stats': {
    get: {
      tags: ['Dashboard'],
      summary: 'Task statistics for the dashboard',
      responses: { 200: ok(ref('DashboardStats')), ...errors(401) },
    },
  },
  '/activities': {
    get: {
      tags: ['Dashboard'],
      summary: 'Activity history across your tasks (newest first), with filters',
      parameters: [
        query(
          'action',
          { type: 'string', example: 'CREATED,STATUS_CHANGED' },
          'Comma-separated: CREATED, UPDATED, STATUS_CHANGED, DELETED, IMAGE_ADDED, IMAGE_REMOVED',
        ),
        query('from', DATE_TIME, 'On or after (ISO datetime)'),
        query('to', DATE_TIME, 'On or before (ISO datetime)'),
        query('search', { type: 'string' }, 'Task title contains (case-insensitive)'),
        query('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
        query('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 'Page size'),
      ],
      responses: {
        200: {
          description: 'OK',
          content: json({
            type: 'object',
            properties: { data: list(ref('Activity')), meta: ref('PaginationMeta') },
          }),
        },
        ...errors(400, 401),
      },
    },
  },
};

export function buildOpenApiDocument(): Json {
  return {
    openapi: '3.1.0',
    info: {
      title: 'TaskFlow API',
      version: '1.0.0',
      description: [
        'Authentication uses httpOnly cookies: `tf_access` (15-minute JWT) and `tf_refresh` (rotating, path `/api/v1/auth`).',
        'Sign in through **POST /auth/login** here and the browser keeps the cookies for the other calls.',
        'State-changing requests must come from the web app origin, so open these docs through the web app (e.g. `http://localhost:5173/api/docs`) to use “Try it out”.',
        'Responses use `{ data }`, `{ data, meta }` or `{ error: { code, message, details?, requestId } }`.',
      ].join('\n\n'),
    },
    servers: [{ url: '/api/v1' }],
    tags: ['Auth', 'OAuth', 'Account', 'Tasks', 'Images', 'Dashboard', 'System'].map((name) => ({
      name,
    })),
    security: [{ cookieAuth: [] }],
    paths,
    components: {
      securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'tf_access' } },
      schemas,
      responses,
    },
  };
}
