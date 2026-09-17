import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/userService";

export async function GET() {
  try {
    const users = await listUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { username, password, permissions } = await request.json();
    const user = await createUser({ username, password, permissions });
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
