import { prisma } from "./prisma.js";
import { hashPassword } from "./passwordHash.js";
import { ALL_PERMISSIONS, ENV_ADMIN_USERNAME } from "./permissions.js";

function sanitizePermissions(permissions) {
  const list = Array.isArray(permissions) ? permissions : [];
  const valid = list.filter((p) => ALL_PERMISSIONS.includes(p));
  return [...new Set(valid)];
}

export async function findUserByUsername(username) {
  if (!username) return null;
  return prisma.user.findUnique({ where: { username } });
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, username: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return users;
}

export async function createUser({ username, password, permissions }) {
  const trimmedUsername = (username || "").trim();
  if (!trimmedUsername) throw new Error("Login bo'sh bo'lishi mumkin emas.");
  if (!password || password.length < 6) throw new Error("Parol kamida 6 belgidan iborat bo'lishi kerak.");
  if (trimmedUsername === ENV_ADMIN_USERNAME) throw new Error("Bu login band.");

  const existing = await findUserByUsername(trimmedUsername);
  if (existing) throw new Error("Bu login band.");

  const user = await prisma.user.create({
    data: {
      username: trimmedUsername,
      passwordHash: hashPassword(password),
      permissions: sanitizePermissions(permissions),
    },
    select: { id: true, username: true, permissions: true, createdAt: true },
  });
  return user;
}

export async function updateUserPermissions(id, permissions) {
  return prisma.user.update({
    where: { id: Number(id) },
    data: { permissions: sanitizePermissions(permissions) },
    select: { id: true, username: true, permissions: true, createdAt: true },
  });
}

export async function resetUserPassword(id, password) {
  if (!password || password.length < 6) throw new Error("Parol kamida 6 belgidan iborat bo'lishi kerak.");
  await prisma.user.update({ where: { id: Number(id) }, data: { passwordHash: hashPassword(password) } });
}

export async function deleteUser(id) {
  await prisma.user.delete({ where: { id: Number(id) } });
}
