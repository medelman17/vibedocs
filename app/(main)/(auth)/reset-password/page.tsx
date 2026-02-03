"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "motion/react"
import { Eye, EyeOff, ArrowRight, Lock, AlertTriangle, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { completePasswordReset } from "@/lib/actions/password-reset"
import { cn } from "@/lib/utils"

// Password requirements (same as signup)
const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
]

function PasswordStrength({ password }: { password: string }) {
  const passed = PASSWORD_REQUIREMENTS.filter((req) => req.test(password)).length
  const strength = passed / PASSWORD_REQUIREMENTS.length

  return (
    <div className="space-y-3">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-300",
              i < passed
                ? strength === 1
                  ? "bg-success"
                  : strength >= 0.6
                    ? "bg-warning"
                    : "bg-error"
                : "bg-muted"
            )}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: i < passed ? 1 : 0.3 }}
            transition={{ duration: 0.2, delay: i * 0.05 }}
          />
        ))}
      </div>

      {/* Requirements list */}
      <div className="grid grid-cols-1 gap-1.5">
        {PASSWORD_REQUIREMENTS.map((req, i) => {
          const passed = req.test(password)
          return (
            <motion.div
              key={i}
              className="flex items-center gap-2 text-xs"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <motion.div
                initial={false}
                animate={{ scale: passed ? [1, 1.2, 1] : 1 }}
                className={cn(
                  "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
                  passed ? "bg-success" : "bg-error"
                )}
              >
                {passed ? (
                  <Check className="w-2.5 h-2.5 text-white" />
                ) : (
                  <X className="w-2.5 h-2.5 text-white" />
                )}
              </motion.div>
              <span className={cn(
                "transition-colors",
                passed ? "text-success" : "text-muted-foreground"
              )}>
                {req.label}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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

  if (!token) {
    return (
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        <motion.div variants={itemVariants} className="space-y-2">
          <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-destructive/10 border border-destructive/20 mb-6">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-center">
            Invalid link
          </h1>
          <p className="text-muted-foreground text-center">
            This password reset link is invalid or has expired.
          </p>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Link href="/forgot-password" className="w-full block">
            <Button className="w-full h-12 font-medium">
              Request a new link
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!token) {
      setError("Invalid reset token")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    // Check all password requirements
    const failedRequirements = PASSWORD_REQUIREMENTS.filter(req => !req.test(password))
    if (failedRequirements.length > 0) {
      setError("Password does not meet all requirements")
      return
    }

    setLoading(true)

    const result = await completePasswordReset(token, password)
    setLoading(false)

    if (!result.success) {
      setError(result.error ?? "Failed to reset password")
      return
    }

    router.push("/login?reset=true")
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
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-center">
          Set new password
        </h1>
        <p className="text-muted-foreground text-center">
          Your new password must be different from previously used passwords.
        </p>
      </motion.div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
          >
            {error}
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a strong password"
              className="h-12 pr-12"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Password strength indicator */}
        {password.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <PasswordStrength password={password} />
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm your new password"
              className={cn(
                "h-12 pr-12",
                confirmPassword.length > 0 && password !== confirmPassword && "border-destructive"
              )}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showConfirmPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-destructive"
            >
              Passwords do not match
            </motion.p>
          )}
        </motion.div>

        <motion.div variants={itemVariants}>
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 font-medium group"
            disabled={loading || password !== confirmPassword}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Reset password
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </motion.div>
      </form>
    </motion.div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
