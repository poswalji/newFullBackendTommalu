const swaggerJSDoc = require('swagger-jsdoc');
const path = require('path');

// OpenAPI specification configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Tommalu API',
      version: '1.0.0',
      description: 'API documentation for Tommalu backend',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local dev' },
      // Dynamically add Vercel URL if present
      ...(process.env.VERCEL_URL
        ? [{ url: `https://${process.env.VERCEL_URL}`, description: 'Vercel' }]
        : []),
      // Static production URL if deployed under a custom domain
      ...(process.env.PUBLIC_API_BASE_URL
        ? [{ url: process.env.PUBLIC_API_BASE_URL, description: 'Production' }]
        : []),
    ],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'jwt',
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // Scan route files for JSDoc annotations using absolute paths
  apis: [
    path.resolve(__dirname, '../routes/*.js'),
    path.resolve(__dirname, '../controllers/*.js'),
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = {
  swaggerSpec,
};


