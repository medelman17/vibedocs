"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "motion/react"
import { Eye, EyeOff, ArrowRight, Check, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { register } from "@/lib/actions/auth"
import { cn } from "@/lib/utils"

// Password requirements
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
                  ? "bg-emerald-500"
                  : strength >= 0.6
                    ? "bg-amber-500"
                    : "bg-red-500"
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
                animate={{
                  scale: passed ? [1, 1.2, 1] : 1,
                  backgroundColor: passed ? "rgb(16 185 129)" : "rgb(239 68 68)",
                }}
                className="w-4 h-4 rounded-full flex items-center justify-center"
              >
                {passed ? (
                  <Check className="w-2.5 h-2.5 text-white" />
                ) : (
                  <X className="w-2.5 h-2.5 text-white" />
                )}
              </motion.div>
              <span className={cn(
                "transition-colors",
                passed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
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

export default function SignupPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const result = await register({
      email: formData.get("email") as string,
      password: formData.get("password") as string,
      name: (formData.get("name") as string) || undefined,
    })

    setLoading(false)

    if (!result.success) {
      setError(result.error ?? "Registration failed")
      return
    }

    router.push("/login?registered=true")
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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create an account</h1>
        <p className="text-muted-foreground">
          Get started with VibeDocs today
        </p>
      </motion.div>

      {/* OAuth buttons */}
      <motion.div variants={itemVariants} className="grid gap-3">
        <Button
          variant="outline"
          size="lg"
          className="w-full h-12 font-medium"
          type="button"
        >
          <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>
      </motion.div>

      {/* Divider */}
      <motion.div variants={itemVariants} className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            or continue with email
          </span>
        </div>
      </motion.div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
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
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            className="h-12"
            autoComplete="name"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="john@example.com"
            className="h-12"
            required
            autoComplete="email"
          />
        </motion.div>

        <motion.div variants={itemVariants} className="space-y-2">
          <Label htmlFor="password">Password</Label>
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
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
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

        <motion.div variants={itemVariants}>
          <Button
            type="submit"
            size="lg"
            className="w-full h-12 font-medium group"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Create account
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        </motion.div>
      </form>

      {/* Sign in link */}
      <motion.p variants={itemVariants} className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground hover:underline underline-offset-4"
        >
          Sign in
        </Link>
      </motion.p>
    </motion.div>
  )
}
