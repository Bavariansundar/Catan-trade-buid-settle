import swaggerJsdoc from "swagger-jsdoc";

export function buildSwaggerSpec(): object {
  return swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: { title: "BayCheArsBar API", version: "0.0.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    apis: [
      "./src/auth/authRoutes.ts",
      "./src/lobby/lobbyRoutes.ts",
      "./src/stats/historyRoutes.ts",
      "./src/stats/profileRoutes.ts",
    ],
  });
}
