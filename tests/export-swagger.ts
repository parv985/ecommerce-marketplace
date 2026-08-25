import swaggerSpec from "../src/docs/swagger.js";

process.stdout.write(JSON.stringify(swaggerSpec, null, 2));
