import { prisma } from "./prisma.js";

export async function getSetting(key, fallback = null) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}
