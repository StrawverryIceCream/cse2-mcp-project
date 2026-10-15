import { Router } from "express";

export const healthRoutes = Router();

healthRoutes.get("/healthz", (_req, res) => {
  res.status(200).send("OK");
});