import "dotenv/config";
import express from "express";
import { registerRoutes } from "./routes/index.js";

const app = express();

app.use(express.json());

registerRoutes(app);

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Corti SDK Examples – Express Web API listening on http://localhost:${port}`);
});
