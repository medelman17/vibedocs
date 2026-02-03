"use client"

import { useState } from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { ArrowLeft, Mail, CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestPasswordReset } from "@/lib/actions/password-reset"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    await requestPasswordReset(formData.get("email") as string)

    setLoading(false)
    setSubmitted(true)
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  }

  if (submitted) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-success/10 border border-success/20 mb-6">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-center">
            Check your email
          </h1>
          <p className="text-muted-foreground text-center">
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            we&apos;ve sent password reset instructions.
          </p>
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-4">
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Didn&apos;t receive an email?</span>
              {" "}Check your spam folder or try again with a different email address.
            </p>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-col gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setSubmitted(false)
              setEmail("")
            }}
            className="w-full h-12"
          >
            <Mail className="mr-2 h-4 w-4" />
            Try a different email
          </Button>

          <Link href="/login" className="w-full">
            <Button variant="ghost" className="w-full h-12">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to sign in
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="space-y-2">
        <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-primary/10 border border-primary/20 mb-6">
          <Mail className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-center">
          Forgot your password?
        </h1>
        <p className="text-muted-foreground text-center">
          No worries, we&apos;ll send you reset instructions.
        </p>
      </motion.div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="john@example.com"
            className="h-12"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 font-medium"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              "Send reset instructions"
            )}
          </Button>
        </motion.div>
      </form>

      {/* Back to login */}
      <motion.div variants={itemVariants}>
        <Link href="/login" className="w-full block">
          <Button variant="ghost" className="w-full h-12 text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to sign in
          </Button>
        </Link>
      </motion.div>
    </motion.div>
  )
}
