import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authorization = request.headers.get("authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Invitation service is not configured." }, { status: 503 });
  }

  const { email, householdId } = await request.json();
  if (typeof email !== "string" || !email.includes("@") || typeof householdId !== "string") {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const accessToken = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: membership } = await serviceClient
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Only a household owner can invite members." }, { status: 403 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail === user.email?.toLowerCase()) {
    return NextResponse.json({ error: "You are already a member." }, { status: 400 });
  }

  const { error: invitationError } = await serviceClient.from("invitations").upsert(
    { household_id: householdId, email: normalizedEmail, invited_by: user.id, accepted_at: null },
    { onConflict: "household_id,email" },
  );
  if (invitationError) return NextResponse.json({ error: "Could not save the invitation." }, { status: 500 });

  const redirectTo = new URL("/", request.url).toString();
  const { error: sendError } = await serviceClient.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: { household_id: householdId },
  });

  if (sendError && /already|registered|exists/i.test(sendError.message)) {
    const emailClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: linkError } = await emailClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: { emailRedirectTo: redirectTo },
    });
    if (linkError) return NextResponse.json({ error: "Invitation saved, but the sign-in email could not be sent." }, { status: 502 });
    return NextResponse.json({ sent: true });
  }
  if (sendError) return NextResponse.json({ error: "Invitation saved, but the email could not be sent." }, { status: 502 });
  return NextResponse.json({ sent: true });
}