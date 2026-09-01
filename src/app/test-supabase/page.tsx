import { createClient } from "@/lib/supabase/server";

export default async function TestSupabasePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("people")
    .select("id, name")
    .order("name");

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold">Supabase Test</h1>

      <div className="mt-4">
        <p>User: {user ? user.email : "Not authenticated"}</p>
      </div>

      <pre className="mt-4">{JSON.stringify({ data, error }, null, 2)}</pre>
    </main>
  );
}
