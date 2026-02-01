"use server"

import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export type WaitlistResult =
  | { success: true }
  | { success: false; error: string }

export async function joinWaitlist(email: string): Promise<WaitlistResult> {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured")
    return { success: false, error: "Service unavailable" }
  }

  if (!process.env.RESEND_AUDIENCE_ID) {
    console.error("RESEND_AUDIENCE_ID is not configured")
    return { success: false, error: "Service unavailable" }
  }

  try {
    const { error } = await resend.contacts.create({
      email,
      audienceId: process.env.RESEND_AUDIENCE_ID,
    })

    if (error) {
      // "Contact already exists" is not really an error for us
      if (error.message?.includes("already exists")) {
        return { success: true }
      }
      console.error("Resend error:", error)
      return { success: false, error: "Failed to join waitlist" }
    }

    return { success: true }
  } catch (err) {
    console.error("Waitlist error:", err)
    return { success: false, error: "Something went wrong" }
  }
}
