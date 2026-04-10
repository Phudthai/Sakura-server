/**
 * @file users.controller.ts
 * @description List users by role for backoffice (team: ADMIN/STAFF, customers, or mixed).
 */

import { Request, Response } from "express";
import { hash } from "bcryptjs";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../../packages/database/src";
import { updateBackofficeUserSchema } from "../../../packages/shared/src";

/** Default when `roles` / `role` query is omitted — team only (never includes CUSTOMER). */
const DEFAULT_ROLES_WHEN_QUERY_EMPTY: UserRole[] = ["ADMIN", "STAFF"];

/** Roles allowed in ?roles= / ?role= */
const ALLOWED_QUERY_ROLES: UserRole[] = ["ADMIN", "STAFF", "CUSTOMER"];

const userListSelect = {
  id: true,
  user_code: true,
  username: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  is_active: true,
  is_email_verified: true,
  created_at: true,
} satisfies Prisma.UserSelect;

export type BackofficeUserListRow = {
  id: number;
  userCode: string;
  username: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
};

function mapUserToListRow(u: {
  id: number;
  user_code: string;
  username: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: Date;
}): BackofficeUserListRow {
  return {
    id: u.id,
    userCode: u.user_code,
    username: u.username ?? null,
    email: u.email ?? null,
    name: u.name ?? null,
    phone: u.phone ?? null,
    role: u.role,
    isActive: u.is_active,
    isEmailVerified: u.is_email_verified,
    createdAt: u.created_at.toISOString(),
  };
}

function parseRolesQuery(
  req: Request,
): { ok: true; roles: UserRole[] } | { ok: false; message: string } {
  const raw = req.query.roles ?? req.query.role;
  if (raw == null || raw === "") {
    return { ok: true, roles: [...DEFAULT_ROLES_WHEN_QUERY_EMPTY] };
  }
  const parts: string[] = Array.isArray(raw)
    ? raw.flatMap((r) => String(r).split(","))
    : String(raw).split(",");
  const upper = parts
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  const set = new Set<string>();
  for (const u of upper) {
    if (u === "ADMIN" || u === "STAFF" || u === "CUSTOMER") set.add(u);
  }
  if (set.size === 0) {
    return {
      ok: false,
      message:
        "roles must be one or more of: ADMIN, STAFF, CUSTOMER (e.g. ?roles=STAFF,ADMIN or ?roles=CUSTOMER)",
    };
  }
  return { ok: true, roles: Array.from(set) as UserRole[] };
}

/**
 * Build where clause: ADMIN/STAFF require is_active; CUSTOMER matches listCustomers (no is_active filter).
 * Mixed roles use OR.
 */
export function buildWhereForBackofficeUserRoles(roles: UserRole[]): Prisma.UserWhereInput {
  const hasCustomer = roles.includes("CUSTOMER");
  const nonCustomer = roles.filter((r) => r !== "CUSTOMER") as UserRole[];

  if (!hasCustomer) {
    return {
      role: { in: roles },
      is_active: true,
    };
  }
  if (nonCustomer.length === 0) {
    return { role: "CUSTOMER" };
  }
  return {
    OR: [
      { role: { in: nonCustomer }, is_active: true },
      { role: "CUSTOMER" },
    ],
  };
}

/** Shared list for GET /users and GET /customers (delegate). */
export async function fetchBackofficeUsersByRoles(
  roles: UserRole[],
): Promise<BackofficeUserListRow[]> {
  const orderBy: Prisma.UserOrderByWithRelationInput[] =
    roles.length === 1 && roles[0] === "CUSTOMER"
      ? [{ created_at: "desc" }]
      : [{ role: "asc" }, { name: "asc" }, { id: "asc" }];

  const users = await prisma.user.findMany({
    where: buildWhereForBackofficeUserRoles(roles),
    orderBy,
    select: userListSelect,
  });
  return users.map(mapUserToListRow);
}

/**
 * ADMIN-only — update user profile / flags / role (for managing staff and customers).
 */
export async function updateBackofficeUser(req: Request, res: Response) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || id <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_ID", message: "Invalid user id" },
    });
  }

  const result = updateBackofficeUserSchema.safeParse(req.body);
  if (!result.success) {
    const errors = result.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return res.status(400).json({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid input", details: { errors } },
    });
  }

  const patch = result.data;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "User not found" },
    });
  }

  if (patch.email != null && patch.email !== existing.email) {
    const taken = await prisma.user.findFirst({
      where: { email: patch.email, NOT: { id } },
    });
    if (taken) {
      return res.status(409).json({
        success: false,
        error: { code: "EMAIL_EXISTS", message: "An account with this email already exists" },
      });
    }
  }

  if (patch.username !== undefined) {
    const un = patch.username;
    if (un != null) {
      const taken = await prisma.user.findFirst({
        where: { username: un, NOT: { id } },
      });
      if (taken) {
        return res.status(409).json({
          success: false,
          error: { code: "USERNAME_EXISTS", message: "This username is already taken" },
        });
      }
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.username !== undefined) data.username = patch.username;
  if (patch.phone !== undefined) data.phone = patch.phone;
  if (patch.is_active !== undefined) data.is_active = patch.is_active;
  if (patch.is_email_verified !== undefined) {
    data.is_email_verified = patch.is_email_verified;
  }
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.password !== undefined) {
    data.password = await hash(patch.password, 12);
  }

  try {
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        user_code: true,
        email: true,
        name: true,
        username: true,
        phone: true,
        role: true,
        is_active: true,
        is_email_verified: true,
        updated_at: true,
      },
    });

    return res.json({
      success: true,
      data: {
        id: updated.id,
        userCode: updated.user_code,
        email: updated.email,
        name: updated.name,
        username: updated.username,
        phone: updated.phone,
        role: updated.role,
        isActive: updated.is_active,
        isEmailVerified: updated.is_email_verified,
        updatedAt: updated.updated_at.toISOString(),
      },
      message: "User updated",
    });
  } catch (e) {
    console.error("[updateBackofficeUser]", e);
    return res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not update user" },
    });
  }
}

export async function listTeamUsers(req: Request, res: Response) {
  const parsed = parseRolesQuery(req);
  if (!parsed.ok) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_QUERY", message: parsed.message },
    });
  }
  const roles = parsed.roles;
  const data = await fetchBackofficeUsersByRoles(roles);

  return res.json({
    success: true,
    data,
    meta: { rolesFilter: roles },
  });
}
