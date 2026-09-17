import { NextResponse } from "next/server";
import { updateUserPermissions, resetUserPassword, deleteUser } from "@/lib/userService";

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const { permissions, password } = await request.json();
    if (password) await resetUserPassword(id, password);
    const user = permissions !== undefined ? await updateUserPermissions(id, permissions) : null;
    return NextResponse.json({ user, ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
