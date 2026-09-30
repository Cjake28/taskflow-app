import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi';

/** `GET /api/docs` (Swagger UI) and `GET /api/docs/openapi.json`. */
export function docsModule(): Router {
  const document = buildOpenApiDocument();
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/',
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'TaskFlow API',
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    }),
  );
  return router;
}
