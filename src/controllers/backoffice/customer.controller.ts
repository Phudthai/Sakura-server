/**
 * @file customer.controller.ts
 * @description Backoffice customer (CUSTOMER role users) — delegates to shared users list.
 */

import { Request, Response } from "express";
import { fetchBackofficeUsersByRoles } from "./users.controller";

export async function listCustomers(_req: Request, res: Response) {
  const data = await fetchBackofficeUsersByRoles(["CUSTOMER"]);
  return res.json({
    success: true,
    data,
  });
}
