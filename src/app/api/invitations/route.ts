import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 503 },
    );
  }
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { email?: unknown; householdId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    typeof body.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()) ||
    typeof body.householdId !== "string"
  ) {
    return NextResponse.json(
      { error: "Enter a valid email address and household." },
      { status: 400 },
    );
  }

  const accessToken = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userResult, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !userResult.user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const user = userResult.user;
  const householdId = body.householdId;
  const normalizedEmail = body.email.trim().toLowerCase();
  if (normalizedEmail === user.email?.toLowerCase()) {
    return NextResponse.json(
      { error: "You are already a member." },
      { status: 400 },
    );
  }

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    return NextResponse.json(
      { error: "Could not verify household access. Apply the latest database migration." },
      { status: 503 },
    );
  }
  if (membership?.role !== "owner") {
    return NextResponse.json(
      { error: "Only a household owner can invite members." },
      { status: 403 },
    );
  }

  const { error: invitationError } = await userClient.from("invitations").upsert(
    {
      household_id: householdId,
      email: normalizedEmail,
      invited_by: user.id,
      accepted_at: null,
    },
    { onConflict: "household_id,email" },
  );
  if (invitationError) {
    return NextResponse.json(
      { error: "Could not save invitation. Apply the latest database migration." },
      { status: 503 },
    );
  }

  const emailClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: emailError } = await emailClient.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: new URL("/", request.url).toString(),
      shouldCreateUser: true,
    },
  });
  if (emailError) {
    return NextResponse.json(
      { error: "Invitation saved, but email delivery failed. Check Supabase Auth email settings." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
