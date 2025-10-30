const swaggerJSDoc = require('swagger-jsdoc');

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
  // Scan route files for JSDoc annotations
  apis: [
    './routes/*.js',
    './controllers/*.js',
  ],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

module.exports = {
  swaggerSpec,
};


