"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignUpForm() {
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    if (res.ok) {
      window.location.href = "/signin";
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Sign up failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-80 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password (min 8 chars)</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit">Sign up</Button>
    </form>
  );
}
